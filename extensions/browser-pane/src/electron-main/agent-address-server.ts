import * as http from "node:http";
import { AddressInfo, Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { stripSecret } from "./agent-secret";

export interface AgentTarget {
  handleHttpRequest(path: string, response: http.ServerResponse): void;
  acceptClient(client: WebSocket): void;
}

// A browser endpoint: the client finds the one page with `Target.*` commands.
const TARGET_PATH = "/devtools/browser";

// The one local address that agents connect to. Only `127.0.0.1`, only with
// the secret. The target keeps one client at a time: a new client replaces
// the old one.
export class AgentAddressServer {
  protected server: http.Server | undefined;
  protected readonly webSockets = new WebSocketServer({ noServer: true });
  protected client: WebSocket | undefined;
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
    this.client?.close();
    this.client = undefined;
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
    try {
      (await this.resolveTarget()).handleHttpRequest(path, response);
    } catch (error) {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
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
      // The target closes the old client. Keep the new one, so `stop` can
      // close it.
      this.client = client;
      client.once("close", () => {
        if (this.client === client) {
          this.client = undefined;
        }
      });
      target.acceptClient(client);
    });
  }
}
