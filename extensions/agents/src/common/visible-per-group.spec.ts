import * as assert from "node:assert";
import { clampVisiblePerGroup, DEFAULT_VISIBLE_PER_GROUP } from "./visible-per-group";

describe("clampVisiblePerGroup", () => {
  it("keeps a valid positive integer as is", () => {
    assert.strictEqual(clampVisiblePerGroup(10), 10);
    assert.strictEqual(clampVisiblePerGroup(1), 1);
  });

  it("floors a fractional value", () => {
    assert.strictEqual(clampVisiblePerGroup(10.7), 10);
  });

  it("gives the default for a value below 1", () => {
    assert.strictEqual(clampVisiblePerGroup(0), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup(-5), DEFAULT_VISIBLE_PER_GROUP);
  });

  it("gives the default for a non-finite number", () => {
    assert.strictEqual(clampVisiblePerGroup(NaN), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup(Infinity), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup(-Infinity), DEFAULT_VISIBLE_PER_GROUP);
  });

  it("gives the default for a value that is not a number", () => {
    assert.strictEqual(clampVisiblePerGroup("10"), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup(undefined), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup(null), DEFAULT_VISIBLE_PER_GROUP);
    assert.strictEqual(clampVisiblePerGroup({}), DEFAULT_VISIBLE_PER_GROUP);
  });
});
