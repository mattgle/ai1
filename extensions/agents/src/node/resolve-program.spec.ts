import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveProgram } from "./resolve-program";

describe("resolveProgram", () => {
  let dir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-resolve-program-"));
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("gives the absolute path of an executable found on PATH", () => {
    const file = path.join(dir, "opencode");
    fs.writeFileSync(file, "#!/bin/sh\n");
    fs.chmodSync(file, 0o755);
    process.env.PATH = dir;
    assert.strictEqual(resolveProgram("opencode"), file);
  });

  it("rejects with the install message when the program is not on PATH", () => {
    process.env.PATH = dir;
    assert.throws(() => resolveProgram("tmux"), /tmux is not installed\. Install it with: brew install tmux/);
  });

  it("skips a file on PATH that is not executable", () => {
    const file = path.join(dir, "opencode");
    fs.writeFileSync(file, "#!/bin/sh\n");
    fs.chmodSync(file, 0o644);
    process.env.PATH = dir;
    assert.throws(
      () => resolveProgram("opencode"),
      /OpenCode is not installed\. Install it with: brew install anomalyco\/tap\/opencode-v2/,
    );
  });

  it("skips a folder on PATH that happens to share the program's name", () => {
    const folder = path.join(dir, "opencode");
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o755);
    process.env.PATH = dir;
    assert.throws(
      () => resolveProgram("opencode"),
      /OpenCode is not installed\. Install it with: brew install anomalyco\/tap\/opencode-v2/,
    );
  });
});
