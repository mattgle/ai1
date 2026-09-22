import * as assert from "node:assert";
import { SessionSummary } from "./agents-protocol";
import { groupSessions, repoName } from "./session-groups";

function session(
  id: string,
  directory: string,
  updatedAt: number,
  status: SessionSummary["status"] = "idle",
): SessionSummary {
  return { id, directory, title: id, status, model: "m", messageCount: 0, updatedAt };
}

describe("repoName", () => {
  it("is the last folder of the directory", () => {
    assert.strictEqual(repoName("/work/meta/alpha"), "alpha");
    assert.strictEqual(repoName("/work/meta/alpha/"), "alpha");
  });
});

describe("groupSessions", () => {
  it("groups by directory and sorts the groups by their newest session", () => {
    const groups = groupSessions([
      session("a1", "/m/alpha", 10),
      session("b1", "/m/beta", 30),
      session("a2", "/m/alpha", 20),
    ]);
    assert.deepStrictEqual(
      groups.map((group) => [group.name, group.sessions.map((s) => s.id)]),
      [
        ["beta", ["b1"]],
        ["alpha", ["a2", "a1"]],
      ],
    );
  });

  it("keeps only the sessions inside the workspace roots when roots are given", () => {
    const groups = groupSessions([session("a1", "/m/alpha", 1), session("x1", "/elsewhere", 2)], ["/m"]);
    assert.deepStrictEqual(
      groups.map((group) => group.name),
      ["alpha"],
    );
  });

  it("treats the workspace root itself as inside", () => {
    const groups = groupSessions([session("r1", "/m", 1)], ["/m"]);
    assert.strictEqual(groups.length, 1);
  });
});
