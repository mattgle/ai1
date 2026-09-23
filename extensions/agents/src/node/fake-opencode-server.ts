import * as http from "node:http";
import { AddressInfo } from "node:net";

export interface FakeSession {
  id: string;
  title: string;
  directory: string;
  model: { id: string; providerID: string };
  time: { created: number; updated: number };
  outcome?: "succeeded" | "failed" | "interrupted";
}

// A small HTTP server that answers like the OpenCode service for the routes
// that the client uses. Tests set its state and push events.
export class FakeOpenCodeServer {
  readonly password = "test-password";
  baseUrl = "";
  sessions: FakeSession[] = [];
  active = new Set<string>();
  pending = new Set<string>();
  messages = new Map<string, string[]>();
  requests: string[] = [];
  brokenSessionBody = false;
  repeatCursor = false;
  endlessPages = false;
  // Delays the `GET /api/session` answer by this many milliseconds, so a
  // test can push an event while a load is still waiting for its session
  // list.
  delayMs = 0;
  // Holds every `GET /api/session` answer instead of sending it, so a test
  // can control exactly when (or whether at all) it is released --
  // `releaseSessionRequest` sends the oldest held one; a request never
  // released this way simply never gets an answer, the same as a hung
  // service.
  holdSessionResponse = false;
  private readonly heldSessionAnswers: (() => void)[] = [];
  // Directories for which the permission-request route answers 500, like
  // the live service does for a directory it does not have on disk.
  brokenPermissionDirectories = new Set<string>();
  // Session ids for which the message-list route answers 404, like the live
  // service does for a session it no longer has (deleted after AI1 already
  // tracked it).
  goneSessionIds = new Set<string>();
  // Delays every message-list answer by this many milliseconds, so a test
  // can observe how many such requests are in flight at once.
  messageRequestDelayMs = 0;
  concurrentMessageRequests = 0;
  maxConcurrentMessageRequests = 0;
  private readonly server: http.Server;
  private readonly streams = new Set<http.ServerResponse>();

  constructor() {
    this.server = http.createServer((request, response) => this.handle(request, response));
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    for (const stream of this.streams) {
      stream.end();
    }
    // A request that is destroyed before it gets its socket leaves that
    // socket idle in Node's keep-alive agent pool for up to 5 seconds, and
    // `close` alone waits for it. So every connection is closed here.
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // The live envelope carries the payload under `data`, with `sessionID`
  // inside it, not under `properties`.
  pushEvent(type: string, properties: Record<string, unknown>): void {
    const data = JSON.stringify({ type, data: properties });
    for (const stream of this.streams) {
      if (stream.destroyed) {
        continue;
      }
      try {
        stream.write(`data: ${data}\n\n`);
      } catch {
        // The socket closed between the read of `streams` and the write.
      }
    }
  }

  // How many `GET /api/session` requests are currently held (see
  // `holdSessionResponse`).
  get heldSessionRequests(): number {
    return this.heldSessionAnswers.length;
  }

  // Sends the oldest held `GET /api/session` answer, in the order the
  // requests arrived.
  releaseSessionRequest(): void {
    this.heldSessionAnswers.shift()?.();
  }

  dropStreams(): void {
    for (const stream of this.streams) {
      stream.destroy();
    }
    this.streams.clear();
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    this.requests.push(`${request.method} ${url.pathname}`);
    const expected = `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}`;
    if (request.headers.authorization !== expected) {
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/api/event") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"type":"server.connected","properties":{}}\n\n');
      this.streams.add(response);
      response.on("close", () => this.streams.delete(response));
      return;
    }
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => this.route(request.method ?? "GET", url, body, response, request.headers));
  }

  private route(
    method: string,
    url: URL,
    body: string,
    response: http.ServerResponse,
    headers: http.IncomingHttpHeaders,
  ): void {
    const json = (status: number, value: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    };
    const parts = url.pathname.split("/").filter(Boolean);
    if (method === "GET" && url.pathname === "/api/session") {
      const answer = (): void => {
        if (this.brokenSessionBody) {
          response.writeHead(200, { "content-type": "application/json" }).end("not json");
          return;
        }
        if (this.repeatCursor) {
          json(200, {
            data: this.sessions.slice(0, 1).map(toSessionRecord),
            cursor: { previous: null, next: "1" },
          });
          return;
        }
        if (this.endlessPages) {
          const page = Number(url.searchParams.get("cursor") ?? 0);
          const sessions = Array.from({ length: 100 }, (_, i) => ({
            id: `endless_${page}_${i}`,
            title: `Endless ${page}_${i}`,
            directory: "/m/alpha",
            model: { id: "m", providerID: "p" },
            time: { created: 0, updated: 0 },
          }));
          json(200, {
            data: sessions.map(toSessionRecord),
            cursor: { previous: null, next: String(page + 1) },
          });
          return;
        }
        const limit = Number(url.searchParams.get("limit") ?? 100);
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        const page = this.sessions.slice(cursor, cursor + limit);
        const next = cursor + limit < this.sessions.length ? String(cursor + limit) : null;
        json(200, { data: page.map(toSessionRecord), cursor: { previous: null, next } });
      };
      if (this.holdSessionResponse) {
        this.heldSessionAnswers.push(answer);
      } else if (this.delayMs > 0) {
        setTimeout(answer, this.delayMs);
      } else {
        answer();
      }
      return;
    }
    if (method === "POST" && url.pathname === "/api/session") {
      // The live service reads the directory from the body's
      // `location.directory`, not from a `?directory=` query parameter.
      const input = JSON.parse(body || "{}") as { title?: string; location?: { directory?: string } };
      const session: FakeSession = {
        id: `ses_${this.sessions.length + 1}`,
        title: input.title ?? "New session",
        directory: input.location?.directory ?? "/m/alpha",
        model: { id: "m", providerID: "p" },
        time: { created: 1, updated: 1 },
      };
      this.sessions.unshift(session);
      json(200, { data: toSessionRecord(session) });
      return;
    }
    if (method === "GET" && url.pathname === "/api/session/active") {
      json(200, { data: Object.fromEntries([...this.active].map((id) => [id, { type: "running" }])) });
      return;
    }
    if (method === "GET" && url.pathname === "/api/permission/request") {
      // The live service scopes this list by the `x-opencode-directory`
      // header, with an exact match against each session's own directory
      // (no prefix match against an ancestor). Verified live.
      const directory = headers["x-opencode-directory"];
      if (typeof directory === "string" && this.brokenPermissionDirectories.has(directory)) {
        json(500, { error: "directory not found" });
        return;
      }
      const matching = [...this.pending].filter(
        (sessionID) => this.sessions.find((session) => session.id === sessionID)?.directory === directory,
      );
      json(200, { data: matching.map((sessionID) => ({ id: `per_${sessionID}`, sessionID })) });
      return;
    }
    if (parts[0] === "api" && parts[1] === "session" && parts[2]) {
      const id = parts[2];
      if (method === "DELETE" && parts.length === 3) {
        this.sessions = this.sessions.filter((session) => session.id !== id);
        json(200, { data: true });
        return;
      }
      if (method === "GET" && parts[3] === "message") {
        if (this.goneSessionIds.has(id)) {
          json(404, { error: "not found" });
          return;
        }
        // The live message list has no `total`; a client counts by paging.
        // Each entry's role is its own `type`, not `info.role`; a user
        // entry carries `text` directly, an assistant entry carries its
        // text in `content`.
        const answer = (): void => {
          const texts = this.messages.get(id) ?? [];
          const records = texts.map((text, index) => toMessageRecord(text, index));
          const ordered = url.searchParams.get("order") === "desc" ? [...records].reverse() : records;
          const limit = Number(url.searchParams.get("limit") ?? ordered.length);
          const offset = Number(url.searchParams.get("cursor") ?? 0);
          const page = ordered.slice(offset, offset + limit);
          const next = offset + limit < ordered.length ? String(offset + limit) : null;
          json(200, { data: page, cursor: { previous: null, next } });
          this.concurrentMessageRequests -= 1;
        };
        this.concurrentMessageRequests += 1;
        this.maxConcurrentMessageRequests = Math.max(
          this.maxConcurrentMessageRequests,
          this.concurrentMessageRequests,
        );
        if (this.messageRequestDelayMs > 0) {
          setTimeout(answer, this.messageRequestDelayMs);
        } else {
          answer();
        }
        return;
      }
    }
    json(404, { error: "not found" });
  }
}

// Maps the fake server's flat `directory` input field to the live shape,
// where the session record carries it under `location.directory`.
function toSessionRecord(session: FakeSession): unknown {
  const { directory, ...rest } = session;
  return { ...rest, location: { directory } };
}

// Maps one stored message text to the live message record shape. The
// index picks the role, alternating user, assistant, user, ...
function toMessageRecord(text: string, index: number): unknown {
  const id = `msg_${index}`;
  const time = { created: index };
  if (index % 2 === 0) {
    return { id, time, type: "user", text };
  }
  return { id, time, type: "assistant", content: [{ type: "text", text }] };
}
