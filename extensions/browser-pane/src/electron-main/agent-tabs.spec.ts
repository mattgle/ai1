import * as assert from "node:assert";
import { AgentTabs, AgentTabsHost } from "./agent-tabs";
import { GuestRegistry } from "./guest-registry";

function setup(window: number | undefined, timeoutMs = 1000) {
  const registry = new GuestRegistry();
  const requests: { windowId: number; requestId: string }[] = [];
  const alive = new Set<number>();
  const host: AgentTabsHost = {
    lastFocusedWindow: () => window,
    requestAgentTab: (windowId, requestId) => requests.push({ windowId, requestId }),
    guestAlive: (guestId) => alive.has(guestId),
  };
  return { tabs: new AgentTabs(registry, host, timeoutMs), registry, requests, alive };
}

describe("AgentTabs", () => {
  it("gives the guest of the agent tab of the last focused window", async () => {
    const { tabs, registry, alive } = setup(1);
    registry.register(7, "tab-a", 1);
    alive.add(7);
    tabs.setAgentTab(1, "tab-a");
    assert.strictEqual(await tabs.resolve(), 7);
  });

  it("asks the window for a new agent tab when it has none, and waits for its guest", async () => {
    const { tabs, registry, requests, alive } = setup(1);
    const resolved = tabs.resolve();
    assert.strictEqual(requests.length, 1);
    tabs.tabCreated(1, requests[0].requestId, "tab-new");
    assert.strictEqual(tabs.agentTabOf(1), "tab-new");
    registry.register(9, "tab-new", 1);
    alive.add(9);
    tabs.guestRegistered(1, "tab-new", 9);
    assert.strictEqual(await resolved, 9);
  });

  it("asks for a new tab when the guest of the agent tab is gone", async () => {
    const { tabs, registry, requests } = setup(1);
    registry.register(7, "tab-a", 1);
    tabs.setAgentTab(1, "tab-a");
    void tabs.resolve().catch(() => undefined);
    assert.strictEqual(requests.length, 1);
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
