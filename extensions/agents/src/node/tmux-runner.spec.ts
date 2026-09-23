import * as assert from "node:assert";
import { tmuxNewCommand } from "./tmux-runner";

describe("tmuxNewCommand", () => {
  it("includes -c <dir> when a directory is given", () => {
    assert.deepStrictEqual(tmuxNewCommand("ai1-1", "/repo"), {
      program: "tmux",
      args: ["new", "-A", "-s", "ai1-1", "-c", "/repo"],
    });
  });

  it("omits -c when there is no directory", () => {
    assert.deepStrictEqual(tmuxNewCommand("ai1-1"), {
      program: "tmux",
      args: ["new", "-A", "-s", "ai1-1"],
    });
  });

  it("omits -c for an empty directory", () => {
    assert.deepStrictEqual(tmuxNewCommand("ai1-1", ""), {
      program: "tmux",
      args: ["new", "-A", "-s", "ai1-1"],
    });
  });
});
