import * as assert from "node:assert";
import { showInBackground } from "./background-window";

describe("showInBackground", () => {
  it("makes show() call showInactive(), so the window does not take the focus", () => {
    const calls: string[] = [];
    const window = {
      show: () => calls.push("show"),
      showInactive: () => calls.push("showInactive"),
    };
    showInBackground(window);
    window.show();
    assert.deepStrictEqual(calls, ["showInactive"]);
  });
});
