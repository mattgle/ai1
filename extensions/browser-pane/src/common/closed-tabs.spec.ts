import * as assert from "node:assert";
import { ClosedTab, ClosedTabs } from "./closed-tabs";

function tab(url: string): ClosedTab {
  return { url, profileId: "default", viewport: { kind: "off" }, previousTabId: undefined };
}

describe("ClosedTabs", () => {
  it("gives the last pushed tab first (last in, first out)", () => {
    const closed = new ClosedTabs();
    closed.push(tab("https://example.com/a"));
    closed.push(tab("https://example.com/b"));
    assert.strictEqual(closed.pop()?.url, "https://example.com/b");
    assert.strictEqual(closed.pop()?.url, "https://example.com/a");
  });

  it("drops the oldest tab after the 21st push", () => {
    const closed = new ClosedTabs();
    for (let index = 0; index < 21; index++) {
      closed.push(tab(`https://example.com/${index}`));
    }
    const popped: string[] = [];
    for (let index = 0; index < 21; index++) {
      const entry = closed.pop();
      if (entry) {
        popped.push(entry.url);
      }
    }
    assert.strictEqual(popped.length, 20);
    assert.strictEqual(popped[popped.length - 1], "https://example.com/1");
    assert.ok(!popped.includes("https://example.com/0"));
  });

  it("gives undefined when the list is empty", () => {
    const closed = new ClosedTabs();
    assert.strictEqual(closed.pop(), undefined);
  });
});
