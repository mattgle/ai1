import * as assert from "node:assert";
import { NoticeRegistry } from "./notice-registry";

describe("NoticeRegistry", () => {
  it("show registers a handle with nothing to cancel the first time", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    assert.strictEqual(registry.get("a"), "first");
    assert.deepStrictEqual(canceled, []);
  });

  it("show cancels an existing entry of the same id before it sets the new one", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.show("a", "second");
    assert.deepStrictEqual(canceled, ["first"]);
    assert.strictEqual(registry.get("a"), "second");
  });

  // The scenario from the review: an old notice's own late callback (its
  // `result` promise resolving after a newer notice has replaced it) must
  // not delete the newer notice.
  it("clearIfCurrent does not drop a newer handle when a stale one's own callback arrives late", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.show("a", "second");
    const removed = registry.clearIfCurrent("a", "first");
    assert.strictEqual(removed, false);
    assert.strictEqual(registry.get("a"), "second");
  });

  it("clearIfCurrent removes the entry when the handle is still the current one", () => {
    const registry = new NoticeRegistry<string>(() => undefined);
    registry.show("a", "first");
    const removed = registry.clearIfCurrent("a", "first");
    assert.strictEqual(removed, true);
    assert.strictEqual(registry.get("a"), undefined);
  });

  it("settle registers the handle via show when still wanted", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.settle("a", "second", true);
    assert.deepStrictEqual(canceled, ["first"]);
    assert.strictEqual(registry.get("a"), "second");
  });

  it("settle cancels the new handle at once and leaves the registry unchanged when not wanted", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.settle("a", "second", false);
    assert.deepStrictEqual(canceled, ["second"]);
    assert.strictEqual(registry.get("a"), "first");
  });

  it("close cancels and removes an id's entry", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.close("a");
    assert.deepStrictEqual(canceled, ["first"]);
    assert.strictEqual(registry.get("a"), undefined);
  });

  it("close on an id with no entry does nothing", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.close("a");
    assert.deepStrictEqual(canceled, []);
  });

  it("closeAll cancels and removes every entry", () => {
    const canceled: string[] = [];
    const registry = new NoticeRegistry<string>((handle) => canceled.push(handle));
    registry.show("a", "first");
    registry.show("b", "second");
    registry.closeAll();
    assert.deepStrictEqual(canceled.sort(), ["first", "second"]);
    assert.strictEqual(registry.get("a"), undefined);
    assert.strictEqual(registry.get("b"), undefined);
  });
});
