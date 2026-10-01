import * as assert from "node:assert";
import { GHOSTTY_COLORS, terminalColorOverrides } from "./terminal-appearance";

describe("terminal color overrides", () => {
  it("accepts known colors in six-digit and eight-digit hexadecimal form", () => {
    assert.deepStrictEqual(
      terminalColorOverrides({ background: "#112233", selectionBackground: "#AABBCC80" }),
      {
        background: "#112233",
        selectionBackground: "#AABBCC80",
      },
    );
  });

  it("rejects invalid data and unknown color names", () => {
    for (const value of [
      undefined,
      null,
      [],
      "#112233",
      { background: "red", cursor: "#123", red: 1, unknown: "#112233" },
    ]) {
      assert.deepStrictEqual(terminalColorOverrides(value), {});
    }
  });

  it("does not change the preset or the input", () => {
    const overrides = { background: "#112233" };
    const result = terminalColorOverrides(overrides);
    result.background = "#445566";
    assert.strictEqual(overrides.background, "#112233");
    assert.strictEqual(GHOSTTY_COLORS.background, "#262427");
  });
});
