import * as assert from "node:assert";
import * as path from "node:path";
import { findOnPath } from "./find-on-path";

describe("findOnPath", () => {
  it("returns the first directory that has the executable", () => {
    const executable = new Set([path.join("/a", "opencode"), path.join("/c", "opencode")]);
    assert.strictEqual(
      findOnPath("opencode", ["/a", "/b", "/c"].join(path.delimiter), (p) => executable.has(p)),
      path.join("/a", "opencode"),
    );
  });

  it("skips a directory that does not have the executable", () => {
    const executable = new Set([path.join("/c", "tmux")]);
    assert.strictEqual(
      findOnPath("tmux", ["/a", "/b", "/c"].join(path.delimiter), (p) => executable.has(p)),
      path.join("/c", "tmux"),
    );
  });

  it("gives undefined when no directory has the executable", () => {
    assert.strictEqual(
      findOnPath("missing", ["/a", "/b"].join(path.delimiter), () => false),
      undefined,
    );
  });

  it("gives undefined for an empty or missing PATH", () => {
    assert.strictEqual(
      findOnPath("opencode", "", () => true),
      undefined,
    );
    assert.strictEqual(
      findOnPath("opencode", undefined, () => true),
      undefined,
    );
  });

  it("ignores empty entries from repeated separators", () => {
    const executable = new Set([path.join("/only", "opencode")]);
    const pathValue = ["", "/only", "", ""].join(path.delimiter);
    assert.strictEqual(
      findOnPath("opencode", pathValue, (p) => executable.has(p)),
      path.join("/only", "opencode"),
    );
  });
});
