import * as assert from "node:assert";
import { SHIFT_WINDOW_MS, shiftApplies } from "./shift-state";

describe("shiftApplies", () => {
  it("is true when the last click or key had Shift, a short time ago", () => {
    assert.strictEqual(shiftApplies({ shift: true, at: 1000 }, 1000 + SHIFT_WINDOW_MS - 1), true);
  });

  it("is false after the time window, without Shift, or with no event", () => {
    assert.strictEqual(shiftApplies({ shift: true, at: 1000 }, 1000 + SHIFT_WINDOW_MS + 1), false);
    assert.strictEqual(shiftApplies({ shift: false, at: 1000 }, 1001), false);
    assert.strictEqual(shiftApplies(undefined, 1001), false);
  });
});
