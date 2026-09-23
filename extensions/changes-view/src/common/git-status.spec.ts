import * as assert from "node:assert";
import {
  discardAllPrompt,
  discardPlan,
  discardPrompt,
  isDeleted,
  isUntracked,
  statusBadge,
} from "./git-status";

describe("statusBadge", () => {
  it("shows U for an untracked file", () => {
    assert.strictEqual(statusBadge("??"), "U");
  });

  it("shows the index letter when the index has a change", () => {
    assert.strictEqual(statusBadge("A "), "A");
    assert.strictEqual(statusBadge("R "), "R");
  });

  it("shows the working tree letter when only the working tree has a change", () => {
    assert.strictEqual(statusBadge(" M"), "M");
    assert.strictEqual(statusBadge(" D"), "D");
  });
});

describe("isUntracked", () => {
  it("is true for the ?? status only", () => {
    assert.strictEqual(isUntracked({ status: "??", path: "a" }), true);
    assert.strictEqual(isUntracked({ status: " M", path: "a" }), false);
  });
});

describe("isDeleted", () => {
  it("is true for a file deleted in the working tree and for a staged deletion", () => {
    assert.strictEqual(isDeleted({ status: " D", path: "a.ts" }), true);
    assert.strictEqual(isDeleted({ status: "D ", path: "a.ts" }), true);
  });

  it("is true for a renamed file that is then deleted in the working tree", () => {
    assert.strictEqual(isDeleted({ status: "RD", path: "b.ts", sourcePath: "a.ts" }), true);
  });

  it("is false for a modified file, an added file, and an untracked file", () => {
    assert.strictEqual(isDeleted({ status: " M", path: "a.ts" }), false);
    assert.strictEqual(isDeleted({ status: "A ", path: "a.ts" }), false);
    assert.strictEqual(isDeleted({ status: "??", path: "a.ts" }), false);
  });
});

describe("discardPlan", () => {
  it("deletes an untracked file", () => {
    assert.deepStrictEqual(discardPlan({ status: "??", path: "new.ts" }), { kind: "delete", path: "new.ts" });
  });

  it("restores the two paths of a rename", () => {
    assert.deepStrictEqual(discardPlan({ status: "R ", path: "b.ts", sourcePath: "a.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "a.ts", "b.ts"],
    });
  });

  it("restores a staged new file, so a file that HEAD does not have is removed", () => {
    assert.deepStrictEqual(discardPlan({ status: "A ", path: "n.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "n.ts"],
    });
  });

  it("restores a file with an unstaged change", () => {
    assert.deepStrictEqual(discardPlan({ status: " M", path: "a.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "a.ts"],
    });
  });

  it("restores a file with a staged change", () => {
    assert.deepStrictEqual(discardPlan({ status: "M ", path: "a.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "a.ts"],
    });
  });

  it("restores the two paths of a rename that has R in the second status column", () => {
    assert.deepStrictEqual(discardPlan({ status: " R", path: "moved.txt", sourcePath: "old.txt" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "old.txt", "moved.txt"],
    });
  });

  it("restores only the copy path of a copy, never the source it copied from", () => {
    assert.deepStrictEqual(discardPlan({ status: "C ", path: "copy.ts", copyOf: "src.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "copy.ts"],
    });
  });

  it("removes an unmerged path with 'restore' for a rename/rename conflict's original name (DD)", () => {
    assert.deepStrictEqual(discardPlan({ status: "DD", path: "original.txt" }), {
      kind: "git",
      args: ["rm", "-f", "--quiet", "--", "original.txt"],
    });
  });

  it("removes an unmerged path added only by them (UA), since restore fails on an unmerged path", () => {
    assert.deepStrictEqual(discardPlan({ status: "UA", path: "theirs-name.txt" }), {
      kind: "git",
      args: ["rm", "-f", "--quiet", "--", "theirs-name.txt"],
    });
  });

  it("removes an unmerged path deleted by us (DU)", () => {
    assert.deepStrictEqual(discardPlan({ status: "DU", path: "f.txt" }), {
      kind: "git",
      args: ["rm", "-f", "--quiet", "--", "f.txt"],
    });
  });

  it("keeps the restore form for the unmerged codes where HEAD has a version (AA, AU, UD, UU)", () => {
    for (const status of ["AA", "AU", "UD", "UU"]) {
      assert.deepStrictEqual(discardPlan({ status, path: "f.txt" }), {
        kind: "git",
        args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "f.txt"],
      });
    }
  });
});

describe("discardPrompt", () => {
  it("asks to delete an untracked file", () => {
    const prompt = discardPrompt({ status: "??", path: "src/new.ts" });
    assert.strictEqual(prompt.ok, "Delete file");
    assert.ok(prompt.msg.includes("new.ts"));
  });

  it("asks to undo a rename and names the two paths", () => {
    const prompt = discardPrompt({ status: "R ", path: "b.ts", sourcePath: "a.ts" });
    assert.strictEqual(prompt.ok, "Undo rename");
    assert.ok(prompt.msg.includes("a.ts") && prompt.msg.includes("b.ts"));
  });

  it("asks to discard the changes of a tracked file", () => {
    assert.strictEqual(discardPrompt({ status: " M", path: "a.ts" }).ok, "Discard changes");
  });

  it("asks to delete a staged new file, the same wording as an untracked file", () => {
    const prompt = discardPrompt({ status: "A ", path: "src/new.ts" });
    assert.strictEqual(prompt.ok, "Delete file");
    assert.ok(prompt.msg.includes("new.ts"));
  });

  it("asks to delete a staged new file that was then modified again, status AM", () => {
    assert.strictEqual(discardPrompt({ status: "AM", path: "a.ts" }).ok, "Delete file");
  });

  it("asks to resolve 'both added' (AA) to HEAD, not to delete, since HEAD has a version", () => {
    const prompt = discardPrompt({ status: "AA", path: "new.txt" });
    assert.strictEqual(prompt.ok, "Resolve to HEAD version");
    assert.ok(!prompt.msg.toLowerCase().includes("removed"));
  });

  it("asks to resolve 'added by us' (AU) to HEAD, not to delete, since HEAD has a version", () => {
    const prompt = discardPrompt({ status: "AU", path: "new.txt" });
    assert.strictEqual(prompt.ok, "Resolve to HEAD version");
    assert.ok(!prompt.msg.toLowerCase().includes("removed"));
  });

  it("asks to resolve 'added by them' (UA) to HEAD, and says the file is removed", () => {
    const prompt = discardPrompt({ status: "UA", path: "new.txt" });
    assert.strictEqual(prompt.ok, "Resolve to HEAD version");
    assert.ok(prompt.msg.toLowerCase().includes("removed"));
  });

  it("asks to resolve 'both modified' (UU) to HEAD", () => {
    assert.strictEqual(discardPrompt({ status: "UU", path: "a.ts" }).ok, "Resolve to HEAD version");
  });

  it("asks to delete a copy, since the discard removes only the copy path", () => {
    const prompt = discardPrompt({ status: "C ", path: "copy.ts", copyOf: "src.ts" });
    assert.strictEqual(prompt.ok, "Delete file");
    assert.ok(prompt.msg.includes("copy.ts"));
  });
});

describe("discardAllPrompt", () => {
  it("names the repository and the number of changes", () => {
    const prompt = discardAllPrompt("payments-api", 3);
    assert.ok(prompt.msg.includes("payments-api") && prompt.msg.includes("3 changes"));
  });

  it("uses the singular for one change", () => {
    assert.ok(discardAllPrompt("payments-api", 1).msg.includes("1 change "));
  });
});
