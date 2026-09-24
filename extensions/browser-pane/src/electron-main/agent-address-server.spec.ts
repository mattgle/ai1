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
  handleHttpRequest(path: string, response: http.ServerResponse): void {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ path }));
  }
  acceptClient(client: WebSocket): void {
    this.clients.at(-1)?.close();
    this.clients.push(client);
  }
}

describe("AgentAddressServer", () => {
  const secret = "s".repeat(43);
  let server: AgentAddressServer;
  let target: FakeTarget;

  beforeEach(() => {
    target = new FakeTarget();
    server = new AgentAddressServer(secret, async () => target);
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

  it("gives /json/list to the target, without the secret in the path", async () => {
    await server.start(await freePort());
    const body = await (await fetch(`${server.address()}json/list`)).json();
    assert.deepStrictEqual(body, { path: "/json/list" });
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

  it("answers 503 with the reason when there is no target", async () => {
    server = new AgentAddressServer(secret, async () => {
      throw new Error("No AI1 window is open.");
    });
    await server.start(await freePort());
    const response = await fetch(`${server.address()}json/list`);
    assert.strictEqual(response.status, 503);
    assert.match(await response.text(), /No AI1 window is open/);
  });

  it("gives a WebSocket client to the target, and closes the old client when a new one connects", async () => {
    await server.start(await freePort());
    const first = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => first.once("open", resolve));
    const firstClosed = new Promise((resolve) => first.once("close", resolve));
    const second = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => second.once("open", resolve));
    await firstClosed;
    assert.strictEqual(target.clients.length, 2);
    second.close();
  });

  it("stops, closes the client, and can start again on another port", async () => {
    await server.start(await freePort());
    const client = new WebSocket(server.webSocketUrl());
    await new Promise((resolve) => client.once("open", resolve));
    const closed = new Promise((resolve) => client.once("close", resolve));
    await server.stop();
    await closed;
    const next = await freePort();
    await server.start(next);
    assert.strictEqual(server.port, next);
    assert.strictEqual((await fetch(`${server.address()}json/version`)).status, 200);
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
});
