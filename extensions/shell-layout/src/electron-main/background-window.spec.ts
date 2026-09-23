import * as assert from "node:assert";
import { keepHidden } from "./background-window";

function fakeWindow(calls: string[]) {
  return {
    show: () => calls.push("show"),
    showInactive: () => calls.push("showInactive"),
    focus: () => calls.push("focus"),
    webContents: {
      setBackgroundThrottling: (allowed: boolean) => calls.push(`throttling ${allowed}`),
    },
  };
}

describe("keepHidden", () => {
  it("makes show(), showInactive(), and focus() do nothing, so the window never appears", () => {
    const calls: string[] = [];
    const window = fakeWindow(calls);
    keepHidden(window);
    calls.length = 0;
    window.show();
    window.showInactive();
    window.focus();
    assert.deepStrictEqual(calls, []);
  });

  it("stops the background throttling, so the hidden page runs at full speed", () => {
    const calls: string[] = [];
    keepHidden(fakeWindow(calls));
    assert.deepStrictEqual(calls, ["throttling false"]);
  });
});
