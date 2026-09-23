import * as assert from "node:assert";
import { IdentityMap } from "./identity-map";

describe("IdentityMap", () => {
  it("gets the value set for a key", () => {
    const map = new IdentityMap<string, { id: number }>();
    const value = { id: 1 };
    map.set("a", value);
    assert.strictEqual(map.get("a"), value);
  });

  it("gives undefined for a key that was never set", () => {
    const map = new IdentityMap<string, string>();
    assert.strictEqual(map.get("a"), undefined);
  });

  it("forgets a key when the given value is still the current one", () => {
    const map = new IdentityMap<string, string>();
    map.set("a", "first");
    assert.strictEqual(map.forgetIfSame("a", "first"), true);
    assert.strictEqual(map.get("a"), undefined);
  });

  // The scenario from the first review of the Agents view's terminals: a
  // session's terminal is replaced by a new one, then the old terminal's own
  // delayed close event arrives and must not drop the new one.
  it("does not drop the current value when a stale value's own forget call arrives late", () => {
    const map = new IdentityMap<string, string>();
    map.set("a", "first");
    map.set("a", "second");
    assert.strictEqual(map.forgetIfSame("a", "first"), false);
    assert.strictEqual(map.get("a"), "second");
  });

  it("lists the current values", () => {
    const map = new IdentityMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    assert.deepStrictEqual([...map.values()].sort(), [1, 2]);
  });

  it("lists the current entries", () => {
    const map = new IdentityMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    assert.deepStrictEqual(
      [...map.entries()].sort((x, y) => x[0].localeCompare(y[0])),
      [
        ["a", 1],
        ["b", 2],
      ],
    );
  });
});
