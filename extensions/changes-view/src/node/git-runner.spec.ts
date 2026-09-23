import * as assert from "node:assert";
import * as os from "node:os";
import { readGit, runGit } from "./git-runner";

describe("readGit", () => {
  it("rejects with a message that contains 'not found' when the git program is missing", async () => {
    await assert.rejects(readGit(os.tmpdir(), ["status"], "ai1-missing-git"), /not found/);
  });

  it("resolves with an empty string when git exits with an error", async () => {
    assert.strictEqual(await readGit(os.tmpdir(), ["not-a-real-subcommand"]), "");
  });
});

describe("runGit", () => {
  it("rejects with a message that contains 'not found' when the git program is missing", async () => {
    await assert.rejects(runGit(os.tmpdir(), ["status"], "ai1-missing-git"), /not found/);
  });
});
