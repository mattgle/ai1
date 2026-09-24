import * as assert from "node:assert";
import { GuestRegistry } from "./guest-registry";

describe("GuestRegistry", () => {
  it("finds the tab of a guest and the guest of a tab", () => {
    const registry = new GuestRegistry();
    registry.register(7, "tab-a", 1);
    assert.deepStrictEqual(registry.entry(7), { tabId: "tab-a", windowId: 1 });
    assert.strictEqual(registry.guestOf(1, "tab-a"), 7);
    assert.strictEqual(registry.guestOf(2, "tab-a"), undefined);
  });

  it("replaces the guest of a tab when the tab registers a new one", () => {
    const registry = new GuestRegistry();
    registry.register(7, "tab-a", 1);
    registry.register(9, "tab-a", 1);
    assert.strictEqual(registry.guestOf(1, "tab-a"), 9);
    assert.strictEqual(registry.entry(7), undefined);
  });

  it("lists the tabs of one window and forgets a guest", () => {
    const registry = new GuestRegistry();
    registry.register(7, "tab-a", 1);
    registry.register(8, "tab-b", 1);
    registry.register(9, "tab-c", 2);
    assert.deepStrictEqual(registry.tabsOf(1), [
      { guestId: 7, tabId: "tab-a" },
      { guestId: 8, tabId: "tab-b" },
    ]);
    registry.forget(7);
    assert.deepStrictEqual(registry.tabsOf(1), [{ guestId: 8, tabId: "tab-b" }]);
  });
});
