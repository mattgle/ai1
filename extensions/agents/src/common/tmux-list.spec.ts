import * as assert from "node:assert";
import { AI1_TMUX_PREFIX, nextTmuxName, parseTmuxList } from "./tmux-list";

describe("parseTmuxList", () => {
  it("keeps the ai1 sessions from the ls output", () => {
    const output =
      "ai1-1: 1 windows (created Mon Sep 22 10:00:00 2026)\nother: 2 windows\nai1-3: 1 windows\n";
    assert.deepStrictEqual(parseTmuxList(output), ["ai1-1", "ai1-3"]);
  });

  it("gives an empty list for the no-server message", () => {
    assert.deepStrictEqual(parseTmuxList("no server running on /tmp/tmux-501/default"), []);
  });

  it("gives an empty list for a line with no colon", () => {
    assert.deepStrictEqual(parseTmuxList("ai1-5 zombie"), []);
  });
});

describe("nextTmuxName", () => {
  it("uses the smallest free number", () => {
    assert.strictEqual(nextTmuxName([]), `${AI1_TMUX_PREFIX}1`);
    assert.strictEqual(nextTmuxName(["ai1-1", "ai1-3"]), `${AI1_TMUX_PREFIX}2`);
  });
});
