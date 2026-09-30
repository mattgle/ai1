import * as assert from "node:assert";
import { selectTabAtIndex } from "./tab-selection";

describe("selectTabAtIndex", () => {
  it("activates the requested tab in the current tab bar", () => {
    const tabBar = { titles: [{}, {}, {}], currentIndex: 0 };
    assert.equal(selectTabAtIndex(tabBar as never, 1), true);
    assert.equal(tabBar.currentIndex, 1);
  });

  it("does nothing when the tab bar does not have that tab", () => {
    const tabBar = { titles: [{}], currentIndex: 0 };
    assert.equal(selectTabAtIndex(tabBar as never, 1), false);
    assert.equal(tabBar.currentIndex, 0);
  });

  it("does nothing when there is no active tab bar", () => {
    assert.equal(selectTabAtIndex(undefined, 0), false);
  });
});
