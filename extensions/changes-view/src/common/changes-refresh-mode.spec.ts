import * as assert from "node:assert";
import { normalizeRefreshMode } from "./changes-refresh-mode";

describe("Changes refresh mode", () => {
  it("defaults to automatic and accepts only an explicit manual value", () => {
    assert.strictEqual(normalizeRefreshMode("manual"), "manual");
    for (const value of [undefined, null, "automatic", "other", true])
      assert.strictEqual(normalizeRefreshMode(value), "automatic");
  });
});
