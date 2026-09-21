import * as assert from "node:assert";
import {
  discardAllPrompt,
  discardPlan,
  discardPrompt,
  isUntracked,
  parseStatusOutput,
  statusBadge,
} from "./git-status";

describe("parseStatusOutput", () => {
  it("parses a modified file", () => {
    assert.deepStrictEqual(parseStatusOutput(" M src/index.ts\n"), [{ status: " M", path: "src/index.ts" }]);
  });

  it("parses a rename into the new path and the source path", () => {
    assert.deepStrictEqual(parseStatusOutput("R  old/a.ts -> new/b.ts\n"), [
      { status: "R ", path: "new/b.ts", sourcePath: "old/a.ts" },
    ]);
  });

  it("parses many lines and skips empty ones", () => {
    const entries = parseStatusOutput("?? notes.md\n M a.ts\n\n");
    assert.deepStrictEqual(
      entries.map((entry) => entry.path),
      ["notes.md", "a.ts"],
    );
  });

  it("returns no entries for empty output", () => {
    assert.deepStrictEqual(parseStatusOutput(""), []);
  });
});

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

  it("checks out HEAD for other tracked files", () => {
    assert.deepStrictEqual(discardPlan({ status: " M", path: "a.ts" }), {
      kind: "git",
      args: ["checkout", "HEAD", "--", "a.ts"],
    });
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
