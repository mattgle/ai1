import * as assert from "node:assert/strict";
import { parseTerminalFontSize } from "./terminal-font-size";

describe("terminal font size input", () => {
  it("accepts whole and fractional sizes allowed by terminal preferences", () => {
    for (const value of ["6", "13", "13.5", " 20 "])
      assert.equal(parseTerminalFontSize(value), Number(value));
  });

  it("rejects empty, non-finite, and smaller sizes", () => {
    for (const value of ["", " ", "5", "-13", "13px", "0x13", "Infinity", "1e10"])
      assert.equal(parseTerminalFontSize(value), undefined);
  });
});
