import * as assert from "node:assert";
import { normalizeScanDepth, parseScanDepth, scanDepthLabel } from "./repository-scan-depth";

describe("repository scan depth", () => {
  it("defaults to all levels and accepts non-negative whole numbers", () => {
    for (const value of [-1, 0, 1, 3, 100]) assert.strictEqual(normalizeScanDepth(value), value);
    for (const value of [undefined, null, "1", -2, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.strictEqual(normalizeScanDepth(value), -1);
    }
  });

  it("validates custom input without accepting fractions or negative values", () => {
    assert.strictEqual(parseScanDepth("0"), 0);
    assert.strictEqual(parseScanDepth(" 3 "), 3);
    for (const value of ["", "-1", "2.5", "1e2", "all", "9007199254740992"]) {
      assert.strictEqual(parseScanDepth(value), undefined);
    }
  });

  it("names preset and custom depths", () => {
    assert.strictEqual(scanDepthLabel(-1), "All levels");
    assert.strictEqual(scanDepthLabel(0), "Current folder only");
    assert.strictEqual(scanDepthLabel(1), "Direct children");
    assert.strictEqual(scanDepthLabel(3), "Depth 3");
  });
});
