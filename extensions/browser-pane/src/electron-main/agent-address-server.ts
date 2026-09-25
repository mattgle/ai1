import * as http from "node:http";
import { AddressInfo, Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { stripSecret } from "./agent-secret";

export interface AgentTarget {
  acceptClient(client: WebSocket): void;
}

// A browser endpoint: the client finds the one page with `Target.*` commands.
const TARGET_PATH = "/devtools/browser";

// The one local address that agents connect to. Only `127.0.0.1`, only with
// the secret. Each WebSocket client gets its own target (its own tab). An
// HTTP request never asks for a target, so it cannot open a tab.
export class AgentAddressServer {
  protected server: http.Server | undefined;
  protected readonly webSockets = new WebSocketServer({ noServer: true });
  protected readonly clients = new Set<WebSocket>();
  // Upgrade requests that wait for their target. `stop` ends them.
  protected readonly pendingSockets = new Set<Socket>();
  protected listeningPort = 0;

  constructor(
    protected readonly secret: string,
    protected readonly resolveTarget: () => Promise<AgentTarget>,
  ) {}

  get port(): number {
    return this.listeningPort;
  }

  address(): string {
    return `http://127.0.0.1:${this.listeningPort}/${this.secret}/`;
  }

  webSocketUrl(): string {
    return `ws://127.0.0.1:${this.listeningPort}/${this.secret}${TARGET_PATH}`;
  }

  start(port: number): Promise<void> {
    const server = http.createServer((request, response) => void this.onRequest(request, response));
    server.on("upgrade", (request, socket, head) => void this.onUpgrade(request, socket as Socket, head));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        this.server = server;
        this.listeningPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    for (const socket of this.pendingSockets) {
      socket.destroy();
    }
    this.pendingSockets.clear();
    const server = this.server;
    this.server = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Only the loopback names, with this server's own port. A browser's fetch
  // sends the real host of the page; a CDP client sends the address it
  // connects to. Both give one of these two forms.
  protected hostAllowed(request: http.IncomingMessage): boolean {
    const host = request.headers.host;
    return host === `127.0.0.1:${this.listeningPort}` || host === `localhost:${this.listeningPort}`;
  }

  protected async onRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    if (!this.hostAllowed(request)) {
      response.writeHead(403).end();
      return;
    }
    const path = stripSecret(request.url ?? "", this.secret);
    if (path === undefined) {
      response.writeHead(404).end();
      return;
    }
    if (path === "/json/version" || path === "/json/version/") {
      const chromeVersion = process.versions.chrome ?? "134.0.0.0";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          Browser: `Chrome/${chromeVersion}`,
          "Protocol-Version": "1.3",
          webSocketDebuggerUrl: this.webSocketUrl(),
        }),
      );
      return;
    }
    this.handleHttpRequest(path, response);
  }

  // Each connection to the browser endpoint gets its own new page, so no page
  // exists before a client connects: the page list is empty.
  protected handleHttpRequest(path: string, response: http.ServerResponse): void {
    if (["/json/list", "/json/list/", "/json", "/json/"].includes(path)) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }
    response.writeHead(404).end();
  }

  protected async onUpgrade(request: http.IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    if (!this.hostAllowed(request)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    // A CDP client (for example Playwright) sends no Origin header. A web
    // page always sends one, even for a same-origin request. Refuse it, so
    // a page cannot open this WebSocket from inside a browser tab.
    if (request.headers.origin !== undefined) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const path = stripSecret(request.url ?? "", this.secret);
    if (path !== TARGET_PATH) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const server = this.server;
    this.pendingSockets.add(socket);
    let target: AgentTarget;
    try {
      target = await this.resolveTarget();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      socket.end(
        `HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${text}`,
      );
      return;
    } finally {
      this.pendingSockets.delete(socket);
    }
    // The server stopped while this request waited for its target (for
    // example, the owner turned the agent address off). Refuse the client.
    if (server === undefined || this.server !== server || socket.destroyed) {
      socket.destroy();
      return;
    }
    this.webSockets.handleUpgrade(request, socket, head, (client) => {
      // Keep each client, so `stop` can close all of them.
      this.clients.add(client);
      client.once("close", () => this.clients.delete(client));
      target.acceptClient(client);
    });
  }
}
