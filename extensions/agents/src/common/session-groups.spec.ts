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
      ["m/alpha"],
    );
  });

  it("treats the workspace root itself as inside", () => {
    const groups = groupSessions([session("r1", "/m", 1)], ["/m"]);
    assert.strictEqual(groups.length, 1);
  });

  it("keeps the open directory first and uses paths for separate nested groups", () => {
    const groups = groupSessions(
      [
        session("app-old", "/work/app", 1),
        session("api", "/work/app/api", 30),
        session("app-new", "/work/app", 2),
        session("deep-api", "/work/app/packages/api", 20),
        session("outside", "/work/application", 40),
      ],
      ["/work/app/"],
    );
    assert.deepStrictEqual(
      groups.map((group) => [group.name, group.sessions.map((s) => s.id)]),
      [
        ["app", ["app-new", "app-old"]],
        ["app/api", ["api"]],
        ["app/packages/api", ["deep-api"]],
      ],
    );
  });

  it("keeps the workspace path in labels when only a nested directory has sessions", () => {
    const groups = groupSessions([session("api", "/work/app/api", 1)], ["/work/app"]);
    assert.deepStrictEqual(
      groups.map((group) => group.name),
      ["app/api"],
    );
  });

  it("uses the closest workspace root for overlapping roots without duplicate sessions", () => {
    const groups = groupSessions(
      [session("app", "/work/app", 1), session("api", "/work/app/api", 2)],
      ["/work", "/work/app"],
    );
    assert.deepStrictEqual(
      groups.map((group) => group.name),
      ["app", "app/api"],
    );
  });

  it("uses absolute paths when the file system root is open", () => {
    const groups = groupSessions([session("api", "/app/api", 2), session("root", "/", 1)], ["/"]);
    assert.deepStrictEqual(
      groups.map((group) => group.name),
      ["/", "/app/api"],
    );
  });
});
