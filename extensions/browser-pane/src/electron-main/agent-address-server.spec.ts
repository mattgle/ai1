import * as assert from "node:assert";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { AgentAddressServer, AgentTarget } from "./agent-address-server";

async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

class FakeTarget implements AgentTarget {
  clients: WebSocket[] = [];
  acceptClient(client: WebSocket): void {
    this.clients.push(client);
  }
}

describe("AgentAddressServer", () => {
  const secret = "s".repeat(43);
  let server: AgentAddressServer;
  let target: FakeTarget;
  let resolveCount: number;

  beforeEach(() => {
    target = new FakeTarget();
    resolveCount = 0;
    server = new AgentAddressServer(secret, async () => {
      resolveCount++;
      return target;
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it("answers /json/version with the WebSocket address that has the secret", async () => {
    await server.start(await freePort());
    const body = await (await fetch(`${server.address()}json/version`)).json();
    assert.strictEqual(body.webSocketDebuggerUrl, server.webSocketUrl());
    assert.ok(server.webSocketUrl().startsWith(`ws://127.0.0.1:${server.port}/${secret}/`));
  });

  it("answers an empty /json/list and does not ask for a target", async () => {
    await server.start(await freePort());
    for (const listPath of ["json/list", "json/list/", "json", "json/"]) {
      const response = await fetch(`${server.address()}${listPath}`);
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(await response.json(), []);
    }
    assert.strictEqual(resolveCount, 0);
  });

  it("answers 404 for another HTTP path and does not ask for a target", async () => {
    await server.start(await freePort());
    assert.strictEqual((await fetch(`${server.address()}json/new`)).status, 404);
    assert.strictEqual((await fetch(`${server.address()}favicon.ico`)).status, 404);
    assert.strictEqual(resolveCount, 0);
  });

  it("answers 404 without the right secret, for HTTP and for a WebSocket", async () => {
    await server.start(await freePort());
    const wrong = `http://127.0.0.1:${server.port}/${"x".repeat(43)}/json/version`;
    assert.strictEqual((await fetch(wrong)).status, 404);
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/wrong/devtools/page/x`);
    const status = await new Promise<number>((resolve) =>
      socket.on("unexpected-response", (_request, response) => resolve(response.statusCode!)),
    );
    assert.strictEqual(status, 404);
  });

  it("refuses an upgrade with 503 and the reason when there is no target", async () => {
    await server.stop();
    server = new AgentAddressServer(secret, async () => {
      throw new Error("No AI1 window is open.");
    });
    await server.start(await freePort());
    const socket = new WebSocket(server.webSocketUrl());
    socket.on("error", () => undefined);
    const response = await new Promise<http.IncomingMessage>((resolve) =>
      socket.on("unexpected-response", (_request, incoming) => resolve(incoming)),
    );
    assert.strictEqual(response.statusCode, 503);
    const body = await new Promise<string>((resolve) => {
      let text = "";
      response.on("data", (chunk) => (text += String(chunk)));
      response.on("end", () => resolve(text));
    });
    assert.match(body, /No AI1 window is open/);
  });

  it("asks for a target for each WebSocket client, and keeps all clients connected", async () => {
    await server.start(await freePort());
    const first = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => first.once("open", resolve));
    const second = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => second.once("open", resolve));
    assert.strictEqual(target.clients.length, 2);
    assert.strictEqual(resolveCount, 2);
    assert.strictEqual(first.readyState, WebSocket.OPEN);
    assert.strictEqual(second.readyState, WebSocket.OPEN);
    first.close();
    second.close();
  });

  it("stops, closes all clients, and can start again on another port", async () => {
    await server.start(await freePort());
    const first = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => first.once("open", resolve));
    const second = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => second.once("open", resolve));
    const closed = Promise.all([
      new Promise((resolve) => first.once("close", resolve)),
      new Promise((resolve) => second.once("close", resolve)),
    ]);
    await server.stop();
    await closed;
    const next = await freePort();
    await server.start(next);
    assert.strictEqual(server.port, next);
    assert.strictEqual((await fetch(`${server.address()}json/version`)).status, 200);
  });

  it("refuses a client whose target comes after the server stopped", async () => {
    let giveTarget!: () => void;
    let asked!: () => void;
    const targetAsked = new Promise<void>((resolve) => (asked = resolve));
    server = new AgentAddressServer(secret, async () => {
      asked();
      await new Promise<void>((resolve) => (giveTarget = resolve));
      return target;
    });
    await server.start(await freePort());
    const client = new WebSocket(server.webSocketUrl());
    client.on("error", () => undefined);
    const ended = new Promise<string>((resolve) => {
      client.once("open", () => resolve("open"));
      client.once("unexpected-response", () => resolve("refused"));
      client.once("close", () => resolve("closed"));
    });
    await targetAsked;
    await server.stop();
    giveTarget();
    assert.notStrictEqual(await ended, "open");
    assert.strictEqual(target.clients.length, 0);
  });

  it("fails to start when the port is in use", async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    try {
      await assert.rejects(server.start((blocker.address() as AddressInfo).port), /EADDRINUSE/);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("answers 404 for an upgrade with the right secret but the wrong path", async () => {
    await server.start(await freePort());
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/${secret}/devtools/page/x`);
    socket.on("error", () => undefined);
    const status = await new Promise<number>((resolve) =>
      socket.on("unexpected-response", (_request, response) => resolve(response.statusCode!)),
    );
    assert.strictEqual(status, 404);
    assert.strictEqual(target.clients.length, 0);
  });

  it("answers 403 for an HTTP request with the wrong Host header", async () => {
    await server.start(await freePort());
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: server.port,
          path: `/${secret}/json/version`,
          headers: { host: "evil.example" },
        },
        resolve,
      );
      request.end();
    });
    assert.strictEqual(response.statusCode, 403);
  });

  it("answers an HTTP request with the Host header localhost:<port>", async () => {
    await server.start(await freePort());
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: server.port,
          path: `/${secret}/json/version`,
          headers: { host: `localhost:${server.port}` },
        },
        resolve,
      );
      request.end();
    });
    assert.strictEqual(response.statusCode, 200);
  });

  it("answers 403 for an upgrade with the wrong Host header", async () => {
    await server.start(await freePort());
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/${secret}/devtools/browser`, {
      headers: { host: "evil.example" },
    });
    socket.on("error", () => undefined);
    const status = await new Promise<number>((resolve) =>
      socket.on("unexpected-response", (_request, response) => resolve(response.statusCode!)),
    );
    assert.strictEqual(status, 403);
    assert.strictEqual(target.clients.length, 0);
  });

  it("answers 403 for an upgrade that carries an Origin header", async () => {
    await server.start(await freePort());
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/${secret}/devtools/browser`, {
      origin: "http://evil.example",
    });
    socket.on("error", () => undefined);
    const status = await new Promise<number>((resolve) =>
      socket.on("unexpected-response", (_request, response) => resolve(response.statusCode!)),
    );
    assert.strictEqual(status, 403);
    assert.strictEqual(target.clients.length, 0);
  });

  it("accepts an upgrade with no Origin header and the right Host and path", async () => {
    await server.start(await freePort());
    const client = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => client.once("open", resolve));
    assert.strictEqual(target.clients.length, 1);
    client.close();
  });
});
