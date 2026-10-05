import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSessionInShell } from "./session-shell-runner";

describe("session shell runner", () => {
  let root: string;
  let tmux: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-session-runner-"));
    tmux = path.join(root, "tmux");
    fs.writeFileSync(tmux, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${path.join(root, "calls")}'\n`, {
      mode: 0o700,
    });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("sets the session link and clears it after the child exits", async () => {
    assert.equal(
      await runSessionInShell(tmux, "ai1-1", "ses_test", process.execPath, ["-e", "process.exit(7)"]),
      7,
    );
    assert.deepEqual(fs.readFileSync(path.join(root, "calls"), "utf8").trim().split("\n"), [
      "set-option -t ai1-1 @ai1_agent_session ses_test",
      "set-option -q -u -t ai1-1 @ai1_agent_session",
    ]);
  });

  it("clears the session link if the program cannot start", async () => {
    await assert.rejects(runSessionInShell(tmux, "ai1-1", "ses_test", path.join(root, "missing"), []));
    assert.match(fs.readFileSync(path.join(root, "calls"), "utf8"), /set-option -q -u/);
  });

  it("rejects invalid terminal and session identities", async () => {
    await assert.rejects(runSessionInShell(tmux, "other", "ses_test", process.execPath, []));
    await assert.rejects(runSessionInShell(tmux, "ai1-1", "bad\nvalue", process.execPath, []));
    assert.equal(fs.existsSync(path.join(root, "calls")), false);
  });
});
