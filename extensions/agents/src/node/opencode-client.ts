import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { SseParser } from "../common/sse-parser";

export interface Connection {
  baseUrl: string;
  password: string;
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

const SERVICE_CONFIG = path.join(os.homedir(), ".config", "opencode", "service.json");
const PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 50;

// The message shown when `program` (its bare name, such as "opencode" or
// "tmux") cannot be found. Shared with the back end's absolute-path
// resolution (`resolve-program.ts`), so both paths give the same wording.
// The owner's OpenCode is the v2 formula of a third-party tap, confirmed
// with `brew`: the plain "opencode" formula installs the old 1.x line.
export function notInstalledMessage(program: string): string {
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

// Reads the service URL and the password. The password stays in this process.
export async function discoverConnection(): Promise<Connection> {
  const status = (await runCommand("opencode", ["service", "status"])).trim();
  const baseUrl = status
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("http"));
  if (!baseUrl) {
    throw new Error(`The OpenCode service does not run. Output: ${status}`);
  }
  let password: string | undefined;
  try {
    password = (JSON.parse(fs.readFileSync(SERVICE_CONFIG, "utf8")) as { password?: string }).password;
  } catch {
    password = undefined;
  }
  if (!password) {
    throw new Error(`AI1 cannot authenticate with the OpenCode service. No password in ${SERVICE_CONFIG}.`);
  }
  return { baseUrl, password };
}

export async function ensureService(): Promise<void> {
  await runCommand("opencode", ["service", "start"]);
}

export class OpenCodeClient {
  constructor(private readonly connection: Connection) {}

  async listSessions(): Promise<RawSession[]> {
    const all: RawSession[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_SESSION_PAGES; pages += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), order: "desc" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const page = await this.get<{ data: SessionRecord[]; cursor?: PageCursor }>(`/api/session?${query}`);
      if (page.data.length === 0) {
        return all;
      }
      all.push(...page.data.map(toRawSession));
      const next = page.cursor?.next ?? undefined;
      if (!next || next === cursor) {
        return all;
      }
      cursor = next;
    }
    console.warn(
      `ai1-agents: the session list stopped after ${MAX_SESSION_PAGES} pages; older sessions are not shown.`,
    );
    return all;
  }

  async activeIds(): Promise<Set<string>> {
    const active = await this.get<{ data: Record<string, unknown> }>("/api/session/active");
    return new Set(Object.keys(active.data));
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
            reject(new Error("AI1 cannot authenticate with the OpenCode service (401)."));
          } else if (response.statusCode && response.statusCode >= 400) {
            reject(
              new Error(`OpenCode ${method} ${route} gave ${response.statusCode}: ${text.slice(0, 200)}`),
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
