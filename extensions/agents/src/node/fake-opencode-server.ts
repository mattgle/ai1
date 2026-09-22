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
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  pushEvent(type: string, properties: Record<string, unknown>): void {
    const data = JSON.stringify({ type, properties });
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
    request.on("end", () => this.route(request.method ?? "GET", url, body, response));
  }

  private route(method: string, url: URL, body: string, response: http.ServerResponse): void {
    const json = (status: number, value: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    };
    const parts = url.pathname.split("/").filter(Boolean);
    if (method === "GET" && url.pathname === "/api/session") {
      if (this.brokenSessionBody) {
        response.writeHead(200, { "content-type": "application/json" }).end("not json");
        return;
      }
      if (this.repeatCursor) {
        json(200, { data: this.sessions.slice(0, 1).map(toSessionRecord), cursor: "1" });
        return;
      }
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      const page = this.sessions.slice(cursor, cursor + limit);
      const next = cursor + limit < this.sessions.length ? String(cursor + limit) : undefined;
      json(200, { data: page.map(toSessionRecord), cursor: next });
      return;
    }
    if (method === "POST" && url.pathname === "/api/session") {
      const input = JSON.parse(body || "{}") as { title?: string };
      const session: FakeSession = {
        id: `ses_${this.sessions.length + 1}`,
        title: input.title ?? "New session",
        directory: url.searchParams.get("directory") ?? "/m/alpha",
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
      json(200, { data: [...this.pending].map((sessionID) => ({ id: `per_${sessionID}`, sessionID })) });
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
        const texts = this.messages.get(id) ?? [];
        const limit = Number(url.searchParams.get("limit") ?? texts.length);
        const ordered = url.searchParams.get("order") === "desc" ? [...texts].reverse() : texts;
        json(200, {
          data: ordered.slice(0, limit).map((text, index) => ({
            info: { id: `msg_${index}`, role: index % 2 === 0 ? "user" : "assistant" },
            parts: [{ type: "text", text }],
          })),
          total: texts.length,
        });
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
