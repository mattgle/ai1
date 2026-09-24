import * as assert from "node:assert";
import { newTabId } from "./tab-id";

describe("newTabId", () => {
  it("makes a different id for each tab, also in the same millisecond", () => {
    assert.strictEqual(newTabId(1700000000000, 0), "tab-loyw3v28-0");
    assert.notStrictEqual(newTabId(1700000000000, 0), newTabId(1700000000000, 1));
  });
});
