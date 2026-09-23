import * as assert from "node:assert";
import { SessionSummary } from "./agents-protocol";
import { diffSessions } from "./session-diff";

function session(id: string, status: SessionSummary["status"]): SessionSummary {
  return { id, directory: "/m/alpha", title: id, status, model: "m", messageCount: 0, updatedAt: 0 };
}

describe("diffSessions", () => {
  it("reports a new session with an undefined previous status", () => {
    const diff = diffSessions(new Map(), [session("a", "blocked")]);
    assert.deepStrictEqual(diff.changed, [{ session: session("a", "blocked"), previous: undefined }]);
    assert.deepStrictEqual(diff.removed, []);
  });

  it("reports a session whose status changed", () => {
    const before = new Map([["a", session("a", "working")]]);
    const diff = diffSessions(before, [session("a", "blocked")]);
    assert.deepStrictEqual(diff.changed, [{ session: session("a", "blocked"), previous: "working" }]);
  });

  it("reports nothing for a session whose status did not change", () => {
    const before = new Map([["a", session("a", "working")]]);
    const diff = diffSessions(before, [session("a", "working")]);
    assert.deepStrictEqual(diff.changed, []);
    assert.deepStrictEqual(diff.removed, []);
  });

  it("reports a removed session", () => {
    const before = new Map([
      ["a", session("a", "working")],
      ["b", session("b", "idle")],
    ]);
    const diff = diffSessions(before, [session("a", "working")]);
    assert.deepStrictEqual(diff.removed, ["b"]);
    assert.deepStrictEqual(diff.changed, []);
  });

  it("combines a change, an addition, and a removal in one diff", () => {
    const before = new Map([
      ["a", session("a", "working")],
      ["b", session("b", "idle")],
    ]);
    const diff = diffSessions(before, [session("a", "done"), session("c", "blocked")]);
    assert.deepStrictEqual(diff.changed, [
      { session: session("a", "done"), previous: "working" },
      { session: session("c", "blocked"), previous: undefined },
    ]);
    assert.deepStrictEqual(diff.removed, ["b"]);
  });
});
