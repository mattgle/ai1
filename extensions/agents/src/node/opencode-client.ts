import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { SseParser } from "../common/sse-parser";

export interface Connection {
  baseUrl: string;
  password: string;
  // The credentials file this connection's own password came from, `~`
  // for the home folder, never the real, absolute path -- named in a 401
  // message, so it points at the file AI1 actually read, not a fixed
  // guess (`chooseServiceConfigPath`'s own `display`).
  servicePasswordDisplayPath: string;
}

export interface RawSession {
  id: string;
  title: string;
  directory: string;
  model: { id: string; providerID: string };
  time: { created: number; updated: number };
  outcome?: "succeeded" | "failed" | "interrupted";
}

interface SessionRecord {
  id: string;
  title?: string;
  location?: { directory?: string };
  model?: { id?: string; providerID?: string };
  time?: { created?: number; updated?: number };
  outcome?: RawSession["outcome"];
}

// A message list entry. The role lives in `type` directly, not under
// `info.role`. A user entry carries its text directly in `text`; an
// assistant entry carries its text blocks in `content`. Verified live.
interface MessageRecord {
  type?: string;
  text?: string;
  content?: { type?: string; text?: string }[];
}

// The opaque pagination cursor of a list response. Verified live: it is an
// object with `next`, not a plain string.
interface PageCursor {
  next?: string | null;
}

export type EventHandler = (type: string, properties: Record<string, unknown>) => void;

export interface PromptFileAttachment {
  uri: string;
  name?: string;
  description?: string;
}

// An OpenCode HTTP error, with the response's own status code, so a caller
// can act on one particular status (for example `AgentsServiceImpl.lastMessage`,
// which treats a 404 for one session as "the session is gone", the same as
// a live `session.deleted` event) without parsing the message text.
export class OpenCodeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenCodeHttpError";
  }
}

// Thrown when this client's own per-request timeout (`requestTimeoutMs`)
// fires before the service answers at all -- a distinct class from
// `OpenCodeHttpError` (which means the service did answer, just with a
// 4xx/5xx) and from a plain network `Error`, so a caller like
// `AgentsServiceImpl`'s message-count phase can react only to a
// genuinely hung request, never to an ordinary per-item failure such as a
// 404 or a 500.
export class OpenCodeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeTimeoutError";
  }
}

const PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 50;
// The spec value (`2026-09-22-ai1-m2-agents-design.md`, "Initial load"):
// the session list stops at 200 sessions, newest first. Reached on the
// second page in the ordinary case (`PAGE_SIZE` 100), well before
// `MAX_SESSION_PAGES` below, which stays as a second, outer safety net for
// a service that answers with pages smaller than `PAGE_SIZE`.
const MAX_SESSIONS = 200;

// The message shown when `program` (its bare name, such as "opencode" or
// "tmux") cannot be found. Shared with the back end's absolute-path
// resolution (`resolve-program.ts`), so both paths give the same wording.
// The owner's OpenCode is the v2 formula of a third-party tap, confirmed
// with `brew`: the plain "opencode" formula installs the old 1.x line.
export function notInstalledMessage(program: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "linux") {
    if (program === "opencode") {
      return "OpenCode v2 is not installed or is not on Linux PATH. Use the owner-approved Linux v2 install source. Do not use Windows OpenCode or an unverified v1 package.";
    }
    const packages: Record<string, string> = { git: "git", tmux: "tmux", lsof: "lsof", ps: "procps" };
    const packageName = Object.prototype.hasOwnProperty.call(packages, program)
      ? packages[program]
      : undefined;
    return packageName
      ? `${program} is not installed or is not on Linux PATH. On Ubuntu, install the ${packageName} package by hand.`
      : "The required program is not installed or is not on Linux PATH. Install the Linux tool by hand.";
  }
  if (platform !== "darwin") {
    return "The required program is not installed or is not on PATH. This platform has no approved install instructions.";
  }
  if (program === "opencode") {
    return "OpenCode is not installed. Install it with: brew install anomalyco/tap/opencode-v2";
  }
  return `${program} is not installed. Install it with: brew install ${program}`;
}

// Runs one command and gives its stdout. A failure rejects with the stderr text.
export function runCommand(program: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(program, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(notInstalledMessage(program)));
      } else if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// `~` for the home folder, never the real, absolute path (which carries
// the owner's user name), for a message a widget can show on screen. A
// path outside the home folder (a custom `XDG_STATE_HOME`) is shown as
// given: there is no home-folder prefix in it to hide.
function displayHomePath(absolute: string, homeDir: string): string {
  return absolute === homeDir || absolute.startsWith(`${homeDir}${path.sep}`)
    ? `~${absolute.slice(homeDir.length)}`
    : absolute;
}

// Which credentials file to read. OpenCode 2.0.15 (verified live
// 2026-09-23, the version the owner's `opencode-v2` tap upgraded to from
// 2.0.12) writes a fresh `$XDG_STATE_HOME/opencode/service.json` (or
// `~/.local/state/opencode/service.json` when `XDG_STATE_HOME` is unset,
// the XDG default) on every service start, with
// `{ id, version, url, pid, password }` -- the `password` there is
// always the one the running service actually checks requests against.
// The older `~/.config/opencode/service.json` (`{ password }` only, no
// `url`) is read only when that state file does not exist, for an
// OpenCode version that predates it. Reading the old file
// unconditionally (AI1's own behavior before this fix) can silently
// check a stale password left over from before an upgrade -- exactly
// what broke the owner's own installed app across the 2.0.12 -> 2.0.15
// upgrade: the state file's password, written at 12:26:29, answered with
// 200; the old file's, unchanged since Sep 21, answered with 401 --
// verified live 2026-09-23, a single read-only `GET` with each, status
// code only, no password logged.
export function chooseServiceConfigPath(
  homeDir: string,
  xdgStateHome: string | undefined,
  exists: (candidate: string) => boolean,
): { path: string; display: string } {
  const stateBase =
    xdgStateHome && xdgStateHome.trim() !== "" ? xdgStateHome : path.join(homeDir, ".local", "state");
  const statePath = path.join(stateBase, "opencode", "service.json");
  if (exists(statePath)) {
    return { path: statePath, display: displayHomePath(statePath, homeDir) };
  }
  const oldPath = path.join(homeDir, ".config", "opencode", "service.json");
  return { path: oldPath, display: displayHomePath(oldPath, homeDir) };
}

// True when a process with this id runs. `EPERM` means that it runs as
// another user.
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// The state file's `url`, but only while the service that wrote it runs.
// A service that stops can leave its file behind, with a `url` that no
// longer answers. The file's `pid` tells whether that service still runs.
export function liveServiceUrl(
  file: { url?: unknown; pid?: unknown } | undefined,
  isAlive: (pid: number) => boolean,
): string | undefined {
  if (typeof file?.url !== "string" || !file.url) {
    return undefined;
  }
  if (typeof file.pid === "number" && !isAlive(file.pid)) {
    return undefined;
  }
  return file.url;
}

// Reads the service URL and the password. The password stays in this
// process. `opencode service status` is only run when the credentials
// file has no live `url` (the old file's own shape, no file at all, or a
// state file whose service no longer runs, see `liveServiceUrl`). The URL
// is resolved, and can still throw "the
// service does not run" (`connectWithStart`, `opencode-hub.ts`, reacts to
// that by starting the service), before the password is checked -- the
// same order as before this fix, so a service that has genuinely never
// run even once (neither credentials file exists yet) still gets that
// same start-and-retry treatment, not a "no password" error that a start
// cannot fix.
export async function discoverConnection(): Promise<Connection> {
  const homeDir = os.homedir();
  const chosen = chooseServiceConfigPath(homeDir, process.env.XDG_STATE_HOME, (candidate) =>
    fs.existsSync(candidate),
  );
  let parsed: { password?: string; url?: string; pid?: number } | undefined;
  try {
    parsed = JSON.parse(fs.readFileSync(chosen.path, "utf8")) as {
      password?: string;
      url?: string;
      pid?: number;
    };
  } catch {
    parsed = undefined;
  }
  let baseUrl = liveServiceUrl(parsed, processIsAlive);
  if (!baseUrl) {
    const status = (await runCommand("opencode", ["service", "status"])).trim();
    baseUrl = status
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("http"));
    if (!baseUrl) {
      throw new Error(`The OpenCode service does not run. Output: ${status}`);
    }
  }
  const password = parsed?.password;
  if (!password) {
    throw new Error(`AI1 cannot authenticate with the OpenCode service. No password in ${chosen.display}.`);
  }
  return { baseUrl, password, servicePasswordDisplayPath: chosen.display };
}

export async function ensureService(): Promise<void> {
  await runCommand("opencode", ["service", "start"]);
}

// How long an ordinary request (every route except the `GET /api/event`
// stream, which is long-lived by design and never gets this timeout) waits
// for the OpenCode service to answer before this client gives up on it. A
// hung service must not keep a load open, and its event queue growing,
// forever -- see `AgentsServiceImpl.load`.
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class OpenCodeClient {
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly connection: Connection,
    options: { requestTimeoutMs?: number } = {},
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  // `order=desc` sorts by `time.updated`, not `time.created` -- verified
  // live (2026-09-23): a session whose `time.created` is the oldest of two
  // but whose `time.updated` is the newest (touched with a `PATCH
  // /api/session/{id}`, which does not change `time.created`) sorted
  // first. So the 200 sessions this keeps are the 200 most recently
  // active across the whole service, not the 200 newest by creation.
  //
  // The cap below is global, over every session the service holds, taken
  // before `AgentsServiceImpl` filters by workspace root -- the owner's
  // own decision (see the M2 backlog ledger, item 3 fix round 1): a
  // workspace-scoped cap would need a `directory` filter on this same
  // call, which the live service accepts but a page of 100 could still
  // mix directories, so filtering after paging remains the correct order.
  // `truncated` tells a caller when this global cap actually cut off real
  // data, so the view can say so instead of silently showing fewer
  // sessions than the workspace may actually have.
  async listSessions(): Promise<{ sessions: RawSession[]; truncated: boolean }> {
    const all: RawSession[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_SESSION_PAGES; pages += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), order: "desc" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const page = await this.get<{ data: SessionRecord[]; cursor?: PageCursor }>(`/api/session?${query}`);
      if (page.data.length === 0) {
        return { sessions: all, truncated: false };
      }
      all.push(...page.data.map(toRawSession));
      const next = page.cursor?.next ?? undefined;
      if (all.length >= MAX_SESSIONS) {
        const truncated = Boolean(next && next !== cursor);
        if (truncated) {
          console.warn(
            `ai1-agents: the session list stopped at ${MAX_SESSIONS} sessions; older sessions are not shown.`,
          );
        }
        return { sessions: all.slice(0, MAX_SESSIONS), truncated };
      }
      if (!next || next === cursor) {
        return { sessions: all, truncated: false };
      }
      cursor = next;
    }
    console.warn(
      `ai1-agents: the session list stopped after ${MAX_SESSION_PAGES} pages; older sessions are not shown.`,
    );
    return { sessions: all, truncated: true };
  }

  async activeIds(): Promise<Set<string>> {
    const active = await this.get<{ data: Record<string, unknown> }>("/api/session/active");
    return new Set(Object.keys(active.data));
  }

  async pendingFormIds(id: string): Promise<string[]> {
    const result = await this.get<{ data: { id: string }[] }>(`/api/session/${encodeURIComponent(id)}/form`);
    return result.data.map((form) => form.id);
  }

  // A second, independent check that one particular session is gone,
  // verified live 2026-09-23 (`GET /api/session/{id}` gives
  // `{ data: SessionRecord }` for a real session, and a 404
  // `SessionNotFoundError` for one that does not exist). Used to confirm a
  // 404 from the message-list route before treating a session as deleted
  // (`AgentsServiceImpl.lastMessage`): one 404 alone could be a transient
  // or unrelated failure of that one route, not proof the session itself
  // is gone.
  async sessionExists(id: string): Promise<boolean> {
    try {
      await this.get(`/api/session/${id}`);
      return true;
    } catch (error) {
      if (error instanceof OpenCodeHttpError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  // Scoped by the `x-opencode-directory` header, verified live: a
  // `?location[directory]=` query parameter (the shape the OpenAPI schema
  // itself documents) is accepted but has no effect, while the header
  // restricts the result to permission requests of sessions whose own
  // directory equals it exactly (no prefix match: the parent of a
  // session's directory gives an empty list). The caller passes one
  // session's own directory, not a workspace root, for that reason.
  //
  // Grouped by session id, with each request's own id kept (not just a
  // session id): a session can have more than one request open at once,
  // and `applyEvent`'s `permission.replied` handling clears one request's
  // id at a time, so the load path must hand it the same per-request ids a
  // live `permission.asked` event would.
  async pendingPermissionRequestIds(directory: string): Promise<Map<string, Set<string>>> {
    const pending = await this.get<{ data: { id: string; sessionID: string }[] }>("/api/permission/request", {
      "x-opencode-directory": directory,
    });
    const bySession = new Map<string, Set<string>>();
    for (const item of pending.data) {
      const ids = bySession.get(item.sessionID) ?? new Set<string>();
      ids.add(item.id);
      bySession.set(item.sessionID, ids);
    }
    return bySession;
  }

  async lastMessageText(id: string): Promise<string | undefined> {
    const page = await this.get<{ data: MessageRecord[] }>(`/api/session/${id}/message?limit=1&order=desc`);
    return textOf(page.data[0]);
  }

  // The message list has no `total`; count by paging with limit=100.
  async messageCount(id: string): Promise<number> {
    let count = 0;
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_SESSION_PAGES; pages += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const page = await this.get<{ data: MessageRecord[]; cursor?: PageCursor }>(
        `/api/session/${id}/message?${query}`,
      );
      count += page.data.length;
      const next = page.cursor?.next ?? undefined;
      if (page.data.length === 0 || !next || next === cursor) {
        return count;
      }
      cursor = next;
    }
    return count;
  }

  // The session location is a body field, `location.directory`; a
  // `?directory=` query parameter is ignored by the live service.
  async createSession(title?: string, directory?: string): Promise<RawSession> {
    const body: { title?: string; location?: { directory: string } } = {};
    if (title) {
      body.title = title;
    }
    if (directory) {
      body.location = { directory };
    }
    const created = await this.request<{ data: SessionRecord }>("POST", "/api/session", body);
    return toRawSession(created.data);
  }

  async deleteSession(id: string): Promise<void> {
    await this.request("DELETE", `/api/session/${id}`);
  }

  async renameSession(id: string, title: string): Promise<void> {
    const name = title.trim();
    if (!name) {
      throw new Error("Session name must not be empty.");
    }
    await this.request("PATCH", `/api/session/${encodeURIComponent(id)}`, { title: name });
  }

  async sendPrompt(id: string, text: string, files: PromptFileAttachment[] = []): Promise<void> {
    await this.request("POST", `/api/session/${encodeURIComponent(id)}/prompt`, { text, files });
  }

  // Opens the event stream and keeps it open. On a cut it reconnects with a
  // growing wait. onState gets false on a cut and true on each (re)connect.
  subscribe(
    onEvent: EventHandler,
    onState: (connected: boolean) => void,
    options: { retryMs?: number; maxRetryMs?: number } = {},
  ): { dispose(): void } {
    let disposed = false;
    let request: http.ClientRequest | undefined;
    let wait = options.retryMs ?? 1000;
    const maxWait = options.maxRetryMs ?? 30_000;
    const connect = (): void => {
      if (disposed) {
        return;
      }
      const parser = new SseParser((event) => {
        try {
          // The envelope carries the event payload under `data`, not
          // `properties`, and `sessionID` lives inside that `data` object.
          // Verified live.
          const parsed = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown> };
          if (parsed.type) {
            onEvent(parsed.type, parsed.data ?? {});
          }
        } catch {
          // A line that is not JSON is a keep-alive; nothing to do.
        }
      });
      request = http.get(this.url("/api/event"), { headers: this.headers() }, (response) => {
        if (disposed) {
          response.resume();
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          retry();
          return;
        }
        wait = options.retryMs ?? 1000;
        onState(true);
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (disposed) {
            return;
          }
          parser.push(chunk);
        });
        response.on("end", retry);
        response.on("error", retry);
      });
      request.on("error", retry);
    };
    let retryTimer: NodeJS.Timeout | undefined;
    const retry = (): void => {
      if (disposed || retryTimer) {
        return;
      }
      onState(false);
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, wait);
      wait = Math.min(wait * 2, maxWait);
    };
    connect();
    return {
      dispose: () => {
        disposed = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
        }
        request?.destroy();
      },
    };
  }

  private get<T>(route: string, extraHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", route, undefined, extraHeaders);
  }

  private request<T>(
    method: string,
    route: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { ...this.headers(), ...extraHeaders };
      if (payload !== undefined) {
        headers["content-type"] = "application/json";
      }
      const request = http.request(this.url(route), { method, headers }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        response.on("end", () => {
          if (response.statusCode === 401) {
            reject(
              new OpenCodeHttpError(
                401,
                `AI1 cannot authenticate with the OpenCode service (401). Check the password in ${this.connection.servicePasswordDisplayPath}.`,
              ),
            );
          } else if (response.statusCode && response.statusCode >= 400) {
            reject(
              new OpenCodeHttpError(
                response.statusCode,
                `OpenCode ${method} ${route} gave ${response.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
          } else if (!text) {
            resolve(undefined as T);
          } else {
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(
                new Error(`OpenCode ${method} ${route} gave a body that is not JSON: ${text.slice(0, 100)}`),
              );
            }
          }
        });
      });
      // Idle-socket timeout, not an overall-duration one: it resets on any
      // byte of activity, so a slow but live answer is not cut off, only a
      // truly hung one. `destroy(error)` both ends the request and gives
      // that error to the `error` listener right below, so this rejects
      // with a clear message instead of leaving the promise pending.
      request.setTimeout(this.requestTimeoutMs, () => {
        request.destroy(
          new OpenCodeTimeoutError(
            `OpenCode did not answer within ${this.requestTimeoutMs}ms (${method} ${route}).`,
          ),
        );
      });
      request.on("error", reject);
      request.end(payload);
    });
  }

  private url(route: string): string {
    return `${this.connection.baseUrl}${route}`;
  }

  private headers(): Record<string, string> {
    const token = Buffer.from(`opencode:${this.connection.password}`).toString("base64");
    return { authorization: `Basic ${token}`, accept: "application/json, text/event-stream" };
  }
}

function toRawSession(record: SessionRecord): RawSession {
  return {
    id: record.id,
    title: record.title ?? "(no title)",
    directory: record.location?.directory ?? "",
    model: { id: record.model?.id ?? "?", providerID: record.model?.providerID ?? "?" },
    time: { created: record.time?.created ?? 0, updated: record.time?.updated ?? 0 },
    outcome: record.outcome,
  };
}

// A user entry carries its text directly; an assistant entry carries its
// text in the last text block of `content`.
function textOf(record: MessageRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }
  if (record.type === "user") {
    return record.text;
  }
  if (record.type === "assistant") {
    const blocks = record.content ?? [];
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].type === "text" && blocks[i].text) {
        return blocks[i].text;
      }
    }
  }
  return undefined;
}
