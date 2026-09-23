import * as assert from "node:assert";
import { AI1_TMUX_PREFIX, nextTmuxName, parseTmuxList, parseTmuxSessions } from "./tmux-list";

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

describe("parseTmuxSessions", () => {
  it("keeps the ai1 sessions with their directory from the -F output", () => {
    const output = "ai1-1:/Users/me/repo-a\nother:/Users/me/repo-b\nai1-3:/Users/me/repo-c\n";
    assert.deepStrictEqual(parseTmuxSessions(output), [
      { name: "ai1-1", directory: "/Users/me/repo-a" },
      { name: "ai1-3", directory: "/Users/me/repo-c" },
    ]);
  });

  it("gives an empty list for the no-server message", () => {
    assert.deepStrictEqual(parseTmuxSessions("no server running on /tmp/tmux-501/default"), []);
  });

  it("gives no directory when the path is empty", () => {
    assert.deepStrictEqual(parseTmuxSessions("ai1-1:\n"), [{ name: "ai1-1", directory: undefined }]);
  });

  it("keeps a directory that itself contains a colon", () => {
    assert.deepStrictEqual(parseTmuxSessions("ai1-1:/Volumes/data:extra\n"), [
      { name: "ai1-1", directory: "/Volumes/data:extra" },
    ]);
  });
});

describe("nextTmuxName", () => {
  it("uses the smallest free number", () => {
    assert.strictEqual(nextTmuxName([]), `${AI1_TMUX_PREFIX}1`);
    assert.strictEqual(nextTmuxName(["ai1-1", "ai1-3"]), `${AI1_TMUX_PREFIX}2`);
  });
});
