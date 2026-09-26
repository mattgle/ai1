import * as assert from "node:assert";
import { AgentTabs, AgentTabsHost } from "./agent-tabs";
import { GuestRegistry } from "./guest-registry";

function setup(window: number | undefined, timeoutMs = 1000) {
  const registry = new GuestRegistry();
  const requests: { windowId: number; requestId: string }[] = [];
  const alive = new Set<number>();
  const attached: number[] = [];
  let changes = 0;
  const host: AgentTabsHost = {
    lastFocusedWindow: () => window,
    requestAgentTab: (windowId, requestId) => requests.push({ windowId, requestId }),
    guestAlive: (guestId) => alive.has(guestId),
    beforeAgentAttach: async (guestId) => {
      attached.push(guestId);
    },
    stateChanged: () => changes++,
  };
  const tabs = new AgentTabs(registry, host, timeoutMs);
  return { tabs, registry, requests, alive, attached, changes: () => changes };
}

// Opens a guest for the request with this index, the way the front end does.
function answer(context: ReturnType<typeof setup>, index: number, tabId: string, guestId: number): void {
  const request = context.requests[index];
  context.tabs.tabCreated(request.windowId, request.requestId, tabId);
  context.registry.register(guestId, tabId, request.windowId);
  context.alive.add(guestId);
  context.tabs.guestRegistered(request.windowId, tabId, guestId);
}

describe("AgentTabs", () => {
  it("asks for a new tab for each connection when no tab waits", async () => {
    const context = setup(1);
    const first = context.tabs.resolve();
    const second = context.tabs.resolve();
    assert.strictEqual(context.requests.length, 2);
    answer(context, 0, "tab-a", 7);
    answer(context, 1, "tab-b", 8);
    assert.strictEqual(await first, 7);
    assert.strictEqual(await second, 8);
    assert.strictEqual(context.tabs.waitingTab(), undefined);
  });

  it("gives the waiting tab once, then asks for a new tab", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.alive.add(7);
    context.tabs.giveTab(1, "tab-a");
    assert.deepStrictEqual(context.tabs.waitingTab(), { windowId: 1, tabId: "tab-a" });
    assert.strictEqual(await context.tabs.resolve(), 7);
    assert.strictEqual(context.tabs.waitingTab(), undefined);
    assert.strictEqual(context.requests.length, 0);
    void context.tabs.resolve().catch(() => undefined);
    assert.strictEqual(context.requests.length, 1);
  });

  it("gives a new tab and clears the mark when the guest of the waiting tab is gone", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.tabs.giveTab(1, "tab-a");
    const resolved = context.tabs.resolve();
    assert.strictEqual(context.tabs.waitingTab(), undefined);
    assert.strictEqual(context.requests.length, 1);
    answer(context, 0, "tab-new", 9);
    assert.strictEqual(await resolved, 9);
  });

  it("gives the new guest of the waiting tab after a profile change", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.alive.add(7);
    context.tabs.giveTab(1, "tab-a");
    context.registry.forget(7);
    context.alive.delete(7);
    context.registry.register(8, "tab-a", 1);
    context.alive.add(8);
    assert.strictEqual(await context.tabs.resolve(), 8);
    assert.strictEqual(context.requests.length, 0);
  });

  it("does not make a requested tab a waiting tab", async () => {
    const context = setup(1);
    const resolved = context.tabs.resolve();
    answer(context, 0, "tab-a", 7);
    await resolved;
    assert.strictEqual(context.tabs.waitingTab(), undefined);
    assert.deepStrictEqual(context.tabs.stateFor(1), []);
  });

  it("clears the host state of the guest before it gives the guest", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.alive.add(7);
    context.tabs.giveTab(1, "tab-a");
    await context.tabs.resolve();
    assert.deepStrictEqual(context.attached, [7]);
  });

  it("gives numbers 1, 2, 3 and does not use a number again after a disconnect", () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.registry.register(8, "tab-b", 1);
    context.registry.register(9, "tab-c", 2);
    context.tabs.connected(7, context.tabs.nextNumber());
    context.tabs.connected(8, context.tabs.nextNumber());
    context.tabs.connected(9, context.tabs.nextNumber());
    assert.deepStrictEqual(context.tabs.stateFor(1), [
      { tabId: "tab-a", state: "connected", number: 1 },
      { tabId: "tab-b", state: "connected", number: 2 },
    ]);
    assert.deepStrictEqual(context.tabs.stateFor(2), [{ tabId: "tab-c", state: "connected", number: 3 }]);
    context.tabs.disconnected(8);
    assert.deepStrictEqual(context.tabs.stateFor(1), [{ tabId: "tab-a", state: "connected", number: 1 }]);
    context.tabs.connected(8, context.tabs.nextNumber());
    assert.deepStrictEqual(context.tabs.stateFor(1), [
      { tabId: "tab-a", state: "connected", number: 1 },
      { tabId: "tab-b", state: "connected", number: 4 },
    ]);
  });

  it("does not give a tab whose guest has a connected agent", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.alive.add(7);
    context.tabs.connected(7, context.tabs.nextNumber());
    context.tabs.giveTab(1, "tab-a");
    assert.strictEqual(context.tabs.waitingTab(), undefined);
    void context.tabs.resolve().catch(() => undefined);
    assert.strictEqual(context.requests.length, 1);
  });

  it("keeps one waiting tab in all windows, and lists it only for its window", () => {
    const context = setup(1);
    context.tabs.giveTab(1, "tab-a");
    context.tabs.giveTab(2, "tab-b");
    assert.deepStrictEqual(context.tabs.waitingTab(), { windowId: 2, tabId: "tab-b" });
    assert.deepStrictEqual(context.tabs.stateFor(1), []);
    assert.deepStrictEqual(context.tabs.stateFor(2), [{ tabId: "tab-b", state: "waiting" }]);
  });

  it("clears the waiting mark only for the window of the waiting tab", () => {
    const context = setup(1);
    context.tabs.giveTab(1, "tab-a");
    context.tabs.giveTab(2, undefined);
    assert.deepStrictEqual(context.tabs.waitingTab(), { windowId: 1, tabId: "tab-a" });
    context.tabs.giveTab(1, undefined);
    assert.strictEqual(context.tabs.waitingTab(), undefined);
  });

  it("tells the host after each change of the state", () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.tabs.giveTab(1, "tab-a");
    assert.strictEqual(context.changes(), 1);
    context.tabs.connected(7, context.tabs.nextNumber());
    assert.strictEqual(context.changes(), 2);
    context.tabs.disconnected(7);
    assert.strictEqual(context.changes(), 3);
    context.tabs.disconnected(7);
    assert.strictEqual(context.changes(), 3);
  });

  it("clears the waiting mark when an agent connects to the waiting tab", () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.tabs.giveTab(1, "tab-a");
    context.tabs.connected(7, context.tabs.nextNumber());
    assert.strictEqual(context.tabs.waitingTab(), undefined);
    assert.deepStrictEqual(context.tabs.stateFor(1), [{ tabId: "tab-a", state: "connected", number: 1 }]);
  });

  it("puts the waiting mark back after a refusal, unless another tab waits now", async () => {
    const context = setup(1);
    context.registry.register(7, "tab-a", 1);
    context.alive.add(7);
    context.tabs.giveTab(1, "tab-a");
    await context.tabs.resolve();
    context.tabs.restoreWaiting(1, "tab-a");
    assert.deepStrictEqual(context.tabs.waitingTab(), { windowId: 1, tabId: "tab-a" });
    context.tabs.giveTab(1, "tab-b");
    context.tabs.restoreWaiting(1, "tab-a");
    assert.deepStrictEqual(context.tabs.waitingTab(), { windowId: 1, tabId: "tab-b" });
  });

  it("fails when no AI1 window is open", async () => {
    const { tabs } = setup(undefined);
    await assert.rejects(tabs.resolve(), /No AI1 window is open/);
  });

  it("fails when the window does not open an agent tab in time", async () => {
    const { tabs } = setup(1, 50);
    await assert.rejects(tabs.resolve(), /did not open an agent tab/);
  });
});
