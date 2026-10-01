import * as assert from "node:assert";
import { selectTabAtIndex } from "./tab-selection";
import { selectPane } from "./pane-selection";

describe("pane selection", () => {
  const panes = [
    { id: "bottom-right", x: 500, y: 400 },
    { id: "top", x: 0, y: 0 },
    { id: "bottom-left", x: 0, y: 400 },
  ];

  it("selects top and bottom rows instead of flat editor groups", () => {
    assert.equal(selectPane(panes, "bottom-right", "row", 0), "top");
    assert.equal(selectPane(panes, "top", "row", 1), "bottom-left");
  });

  it("selects columns only within the current row", () => {
    assert.equal(selectPane(panes, "bottom-left", "column", 1), "bottom-right");
    assert.equal(selectPane(panes, "bottom-right", "column", 0), "bottom-left");
    assert.equal(selectPane(panes, "top", "column", 1), undefined);
  });

  it("keeps the column when both rows have that column", () => {
    const grid = [...panes, { id: "top-right", x: 500, y: 0 }];
    assert.equal(selectPane(grid, "bottom-right", "row", 0), "top-right");
  });

  it("handles empty layouts, missing focus, and invalid indexes", () => {
    assert.equal(selectPane([], undefined, "row", 0), undefined);
    assert.equal(selectPane(panes, undefined, "column", 0), "top");
    assert.equal(selectPane(panes, "top", "row", 2), undefined);
    assert.equal(selectPane(panes, "top", "row", -1), undefined);
  });
});

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
