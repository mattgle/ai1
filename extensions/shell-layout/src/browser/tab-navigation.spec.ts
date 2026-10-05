import * as assert from "node:assert";
import { selectTabAtIndex } from "./tab-selection";
import { selectPanel } from "./pane-selection";

describe("panel selection", () => {
  const panels = [
    { id: "bottom-right", x: 500, y: 400 },
    { id: "top-left", x: 0, y: 0 },
    { id: "bottom-left", x: 0, y: 400 },
    { id: "top-right", x: 500, y: 1 },
  ];

  it("numbers panels left to right, then top to bottom", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((index) => selectPanel(panels, index)),
      ["top-left", "top-right", "bottom-left", "bottom-right"],
    );
  });

  it("does not change the input order", () => {
    const before = [...panels];
    selectPanel(panels, 0);
    assert.deepEqual(panels, before);
  });

  it("handles empty layouts, missing panels, and invalid indexes", () => {
    assert.equal(selectPanel([], 0), undefined);
    assert.equal(selectPanel(panels, 4), undefined);
    assert.equal(selectPanel(panels, -1), undefined);
    assert.equal(selectPanel(panels, 0.5), undefined);
  });
});

describe("selectTabAtIndex", () => {
  it("activates the requested tab in the current tab bar", () => {
    const tabBar = { titles: [{}, {}, {}], currentIndex: 0 };
    assert.equal(selectTabAtIndex(tabBar, 1), true);
    assert.equal(tabBar.currentIndex, 1);
  });

  it("does nothing when the tab bar does not have that tab", () => {
    const tabBar = { titles: [{}], currentIndex: 0 };
    assert.equal(selectTabAtIndex(tabBar, 1), false);
    assert.equal(tabBar.currentIndex, 0);
  });

  it("does nothing when there is no active tab bar", () => {
    assert.equal(selectTabAtIndex(undefined, 0), false);
  });
});
