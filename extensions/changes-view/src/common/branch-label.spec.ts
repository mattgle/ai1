import * as assert from "node:assert";
import { branchLabel } from "./branch-label";

describe("branchLabel", () => {
  it("shows the branch name", () => {
    assert.strictEqual(branchLabel({ branch: "main" }), "main");
  });

  it("shows '(no commits)' for an empty branch that is not detached", () => {
    assert.strictEqual(branchLabel({ branch: "" }), "(no commits)");
  });

  it("shows '(detached)' for an empty branch that is detached", () => {
    assert.strictEqual(branchLabel({ branch: "", detached: true }), "(detached)");
  });
});
