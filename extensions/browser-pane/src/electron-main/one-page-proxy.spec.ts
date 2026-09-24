import * as assert from "node:assert";
import { OnePageProxy, ProxyClient, ProxyGuest } from "./one-page-proxy";

type Listener = (...args: unknown[]) => void;

class FakeDebugger {
  attached = false;
  attachCount = 0;
  detachCount = 0;
  sent: { method: string; params: unknown; sessionId?: string }[] = [];
  private readonly listeners = new Map<string, Listener[]>();
  answers: Record<string, unknown> = {};

  isAttached(): boolean {
    return this.attached;
  }
  attach(): void {
    this.attached = true;
    this.attachCount++;
  }
  // Electron sends the "detach" event also for a detach that the proxy asked
  // for, before `detach()` returns.
  detach(): void {
    this.attached = false;
    this.detachCount++;
    this.emit("detach", {}, "target closed");
  }
  async sendCommand(method: string, params?: unknown, sessionId?: string): Promise<unknown> {
    this.sent.push({ method, params, sessionId });
    if (method === "Target.getTargetInfo") {
      return { targetInfo: { targetId: "REAL-FRAME-ID", type: "webview" } };
    }
    if (method in this.answers) {
      return this.answers[method];
    }
    return {};
  }
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

class FakeClient implements ProxyClient {
  readyState = 1;
  received: Record<string, unknown>[] = [];
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();
  send(data: string): void {
    this.received.push(JSON.parse(data));
  }
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.readyState = 3;
      this.emit("close");
    }
  }
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
  async request(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    const count = this.received.length;
    this.emit("message", Buffer.from(JSON.stringify(message)));
    for (let tries = 0; tries < 100; tries++) {
      const reply = this.received.slice(count).find((item) => item.id === message.id);
      if (reply) {
        return reply;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`no reply to ${String(message.method)}`);
  }
}

// A real `ws` client sends its "close" event later, not in `close()`.
class LateCloseClient extends FakeClient {
  override close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

function setup() {
  const debuggerFake = new FakeDebugger();
  const guest: ProxyGuest = {
    debugger: debuggerFake as unknown as ProxyGuest["debugger"],
    isDestroyed: () => false,
    getTitle: () => "Button",
    getURL: () => "http://127.0.0.1:1/button",
    getUserAgent: () => "Test",
  };
  const changes: boolean[] = [];
  const screenshots: unknown[] = [];
  const proxy = new OnePageProxy(guest, {
    onClientChange: (connected) => changes.push(connected),
    captureScreenshot: async (params) => {
      screenshots.push(params);
      return { data: "PNG" };
    },
  });
  return { proxy, debuggerFake, changes, screenshots };
}

async function attachedClient(proxy: OnePageProxy): Promise<{ client: FakeClient; sessionId: string }> {
  const client = new FakeClient();
  proxy.acceptClient(client);
  await client.request({
    id: 1,
    method: "Target.setAutoAttach",
    params: { autoAttach: true, flatten: true },
  });
  const event = client.received.find((item) => item.method === "Target.attachedToTarget") as {
    params: { sessionId: string };
  };
  return { client, sessionId: event.params.sessionId };
}

describe("OnePageProxy", () => {
  it("sends Target.attachedToTarget with the real target id before the reply to Target.setAutoAttach", async () => {
    const { proxy } = setup();
    const client = new FakeClient();
    proxy.acceptClient(client);
    await client.request({
      id: 1,
      method: "Target.setAutoAttach",
      params: { autoAttach: true, flatten: true },
    });
    assert.strictEqual(client.received[0].method, "Target.attachedToTarget");
    const params = client.received[0].params as {
      targetInfo: Record<string, unknown>;
      waitingForDebugger: boolean;
    };
    assert.strictEqual(params.targetInfo.targetId, "REAL-FRAME-ID");
    assert.strictEqual(params.targetInfo.type, "page");
    assert.strictEqual(params.targetInfo.browserContextId, "ai1-agent-context");
    assert.strictEqual(params.waitingForDebugger, false);
    assert.deepStrictEqual(client.received[1], { id: 1, result: {} });
  });

  it("attaches the debugger again for each client and enables no domain itself", async () => {
    const { proxy, debuggerFake } = setup();
    await attachedClient(proxy);
    await attachedClient(proxy);
    assert.strictEqual(debuggerFake.attachCount, 2);
    assert.ok(debuggerFake.sent.every((command) => !command.method.endsWith(".enable")));
  });

  it("forwards a page command and gives the reply with the request's session id", async () => {
    const { proxy, debuggerFake } = setup();
    debuggerFake.answers["Runtime.evaluate"] = { result: { value: 2 } };
    const { client, sessionId } = await attachedClient(proxy);
    const reply = await client.request({
      id: 2,
      method: "Runtime.evaluate",
      params: { expression: "1+1" },
      sessionId,
    });
    assert.deepStrictEqual(reply, { id: 2, result: { result: { value: 2 } }, sessionId });
    assert.deepStrictEqual(debuggerFake.sent.at(-1), {
      method: "Runtime.evaluate",
      params: { expression: "1+1" },
      sessionId: undefined,
    });
  });

  it("tags page events with the page session id and keeps the id of a child session", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    debuggerFake.emit("message", {}, "Page.loadEventFired", { timestamp: 1 });
    debuggerFake.emit("message", {}, "Target.attachedToTarget", { sessionId: "CHILD", targetInfo: {} });
    debuggerFake.emit("message", {}, "Runtime.consoleAPICalled", { type: "log" }, "CHILD");
    assert.deepStrictEqual(client.received.at(-3), {
      method: "Page.loadEventFired",
      params: { timestamp: 1 },
      sessionId,
    });
    assert.strictEqual(client.received.at(-1)!.sessionId, "CHILD");
  });

  it("tags a page event with the page session id when Electron gives an empty session id", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    debuggerFake.emit("message", {}, "Page.loadEventFired", { timestamp: 1 }, "");
    assert.deepStrictEqual(client.received.at(-1), {
      method: "Page.loadEventFired",
      params: { timestamp: 1 },
      sessionId,
    });
  });

  it("forwards a command of a child session with that session id", async () => {
    const { proxy, debuggerFake } = setup();
    const { client } = await attachedClient(proxy);
    debuggerFake.emit("message", {}, "Target.attachedToTarget", { sessionId: "CHILD", targetInfo: {} });
    await client.request({ id: 3, method: "Runtime.runIfWaitingForDebugger", sessionId: "CHILD" });
    assert.deepStrictEqual(debuggerFake.sent.at(-1), {
      method: "Runtime.runIfWaitingForDebugger",
      params: {},
      sessionId: "CHILD",
    });
  });

  it("refuses an unknown session id", async () => {
    const { proxy } = setup();
    const { client } = await attachedClient(proxy);
    const reply = await client.request({ id: 4, method: "Runtime.evaluate", sessionId: "OTHER" });
    assert.match(String((reply.error as { message: string }).message), /No session with given id/);
  });

  it("gives the one page for Target.createTarget on the root, and never makes a tab", async () => {
    const { proxy, debuggerFake } = setup();
    const { client } = await attachedClient(proxy);
    const reply = await client.request({
      id: 5,
      method: "Target.createTarget",
      params: { url: "about:blank" },
    });
    assert.deepStrictEqual(reply.result, { targetId: "REAL-FRAME-ID" });
    assert.ok(!debuggerFake.sent.some((command) => command.method === "Target.createTarget"));
  });

  it("refuses browser-wide and target commands on the page session", async () => {
    const { proxy } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    for (const [id, method] of [
      [6, "Browser.close"],
      [7, "Target.closeTarget"],
      [8, "Target.createBrowserContext"],
    ] as const) {
      const reply = await client.request({ id, method, sessionId });
      assert.ok(reply.error, method);
    }
  });

  for (const [method, params] of [
    ["Target.getTargets", {}],
    ["Target.setDiscoverTargets", { discover: true }],
    ["Target.getTargetInfo", { targetId: "OTHER-TARGET" }],
    ["Target.activateTarget", { targetId: "OTHER-TARGET" }],
    ["Target.sendMessageToTarget", { message: "{}", targetId: "OTHER-TARGET" }],
    ["Target.attachToTarget", { targetId: "OTHER-TARGET", flatten: true }],
    ["Target.createTarget", { url: "http://127.0.0.1:1/" }],
    ["Target.closeTarget", { targetId: "OTHER-TARGET" }],
    ["Target.detachFromTarget", { sessionId: "UNKNOWN" }],
    ["Target.exposeDevToolsProtocol", { targetId: "OTHER-TARGET" }],
    ["Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp" }],
    ["Browser.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp" }],
    ["Browser.getVersion", {}],
  ] as const) {
    it(`refuses ${method} on the page session and on a child session, and does not forward it`, async () => {
      const { proxy, debuggerFake } = setup();
      const { client, sessionId } = await attachedClient(proxy);
      debuggerFake.emit("message", {}, "Target.attachedToTarget", { sessionId: "CHILD", targetInfo: {} });
      const sentBefore = debuggerFake.sent.length;
      for (const [id, session] of [
        [20, sessionId],
        [21, "CHILD"],
      ] as const) {
        const reply = await client.request({ id, method, params, sessionId: session });
        assert.ok(reply.error, `${method} on ${session}`);
        assert.strictEqual(reply.sessionId, session);
      }
      assert.deepStrictEqual(debuggerFake.sent.slice(sentBefore), []);
    });
  }

  it("forwards Target.setAutoAttach on the page session, for child sessions", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    const params = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };
    await client.request({ id: 30, method: "Target.setAutoAttach", params, sessionId });
    assert.deepStrictEqual(debuggerFake.sent.at(-1), {
      method: "Target.setAutoAttach",
      params,
      sessionId: undefined,
    });
  });

  it("forwards Target.detachFromTarget only for a known child session", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    debuggerFake.emit("message", {}, "Target.attachedToTarget", { sessionId: "CHILD", targetInfo: {} });
    const reply = await client.request({
      id: 31,
      method: "Target.detachFromTarget",
      params: { sessionId: "CHILD" },
      sessionId,
    });
    assert.deepStrictEqual(reply.result, {});
    assert.deepStrictEqual(debuggerFake.sent.at(-1), {
      method: "Target.detachFromTarget",
      params: { sessionId: "CHILD" },
      sessionId: undefined,
    });
    const own = await client.request({
      id: 32,
      method: "Target.detachFromTarget",
      params: { sessionId },
      sessionId,
    });
    assert.ok(own.error);
  });

  it("answers Target.getTargetInfo without a target id on the page session with the page, locally", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    const sentBefore = debuggerFake.sent.length;
    const reply = await client.request({ id: 33, method: "Target.getTargetInfo", sessionId });
    const info = (reply.result as { targetInfo: Record<string, unknown> }).targetInfo;
    assert.strictEqual(info.targetId, "REAL-FRAME-ID");
    assert.strictEqual(info.type, "page");
    assert.deepStrictEqual(debuggerFake.sent.slice(sentBefore), []);
  });

  it("refuses Page.navigate to an address that is not http, https, or about:blank", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    debuggerFake.emit("message", {}, "Target.attachedToTarget", { sessionId: "CHILD", targetInfo: {} });
    const sentBefore = debuggerFake.sent.length;
    for (const [id, url, session] of [
      [40, "file:///etc/hosts", sessionId],
      [41, "chrome://version", sessionId],
      [42, "javascript:alert(1)", sessionId],
      [43, "file:///etc/hosts", "CHILD"],
    ] as const) {
      const reply = await client.request({
        id,
        method: "Page.navigate",
        params: { url },
        sessionId: session,
      });
      assert.match(String((reply.error as { message: string }).message), /only http and https/, url);
    }
    assert.deepStrictEqual(debuggerFake.sent.slice(sentBefore), []);
  });

  it("forwards Page.navigate to an http address and to about:blank", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    for (const [id, url] of [
      [44, "http://127.0.0.1:1/form"],
      [45, "about:blank"],
    ] as const) {
      await client.request({ id, method: "Page.navigate", params: { url }, sessionId });
      assert.deepStrictEqual(debuggerFake.sent.at(-1), {
        method: "Page.navigate",
        params: { url },
        sessionId: undefined,
      });
    }
  });

  it("refuses Target.createTarget on the root with an address that is not http or https", async () => {
    const { proxy, debuggerFake } = setup();
    const { client } = await attachedClient(proxy);
    const reply = await client.request({
      id: 46,
      method: "Target.createTarget",
      params: { url: "file:///etc/hosts" },
    });
    assert.match(String((reply.error as { message: string }).message), /only http and https/);
    assert.ok(!debuggerFake.sent.some((command) => command.method === "Page.navigate"));
  });

  it("answers Page.bringToFront locally and sends a screenshot through the hook", async () => {
    const { proxy, debuggerFake, screenshots } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    const front = await client.request({ id: 9, method: "Page.bringToFront", sessionId });
    assert.deepStrictEqual(front.result, {});
    assert.ok(!debuggerFake.sent.some((command) => command.method === "Page.bringToFront"));
    const shot = await client.request({
      id: 10,
      method: "Page.captureScreenshot",
      params: { format: "png" },
      sessionId,
    });
    assert.deepStrictEqual(shot.result, { data: "PNG" });
    assert.deepStrictEqual(screenshots, [{ format: "png" }]);
  });

  it("refuses an unknown root command, and Browser.close on the root closes only the client", async () => {
    const { proxy, debuggerFake } = setup();
    const { client } = await attachedClient(proxy);
    const unknown = await client.request({ id: 11, method: "SystemInfo.getInfo" });
    assert.ok(unknown.error);
    await client.request({ id: 12, method: "Browser.close" });
    assert.strictEqual(client.closed, true);
    assert.strictEqual(debuggerFake.attached, false);
  });

  it("replaces the old client, and the old client's close does not detach the new client's debugger", async () => {
    const { proxy, debuggerFake, changes } = setup();
    const first = await attachedClient(proxy);
    const second = await attachedClient(proxy);
    assert.strictEqual(first.client.closed, true);
    assert.strictEqual(second.client.closed, false);
    assert.strictEqual(debuggerFake.attached, true);
    assert.deepStrictEqual(changes, [true, false, true]);
  });

  it("stop closes the client and reports no client one time, also when the close event comes later", async () => {
    const { proxy, debuggerFake, changes } = setup();
    const client = new LateCloseClient();
    proxy.acceptClient(client);
    assert.strictEqual(proxy.connected, true);
    proxy.stop();
    assert.strictEqual(client.closed, true);
    assert.strictEqual(proxy.connected, false);
    assert.strictEqual(debuggerFake.attached, false);
    client.emit("close");
    assert.deepStrictEqual(changes, [true, false]);
  });

  it("sends Target.detachedFromTarget and closes the client when the debugger detaches", async () => {
    const { proxy, debuggerFake } = setup();
    const { client, sessionId } = await attachedClient(proxy);
    debuggerFake.attached = false;
    debuggerFake.emit("detach", {}, "target closed");
    assert.deepStrictEqual(client.received.at(-1), {
      method: "Target.detachedFromTarget",
      params: { sessionId, targetId: "REAL-FRAME-ID" },
    });
    assert.strictEqual(client.closed, true);
  });
});
