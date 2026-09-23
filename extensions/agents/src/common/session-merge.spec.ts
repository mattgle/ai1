import * as assert from "node:assert";
import { SessionSummary } from "./agents-protocol";
import { mergeSnapshot } from "./session-merge";

function session(id: string, status: SessionSummary["status"], updatedAt = 0): SessionSummary {
  return { id, directory: "/m/alpha", title: id, status, model: "m", messageCount: 0, updatedAt };
}

describe("mergeSnapshot", () => {
  it("keeps the event value for a session whose snapshot entry is stale", () => {
    const current = new Map([["a", session("a", "blocked", 5)]]);
    const lastEventSeq = new Map([["a", 4]]);
    const merge = mergeSnapshot(current, lastEventSeq, /* loadStartedAtSeq */ 3, [
      session("a", "working", 1),
    ]);
    assert.deepStrictEqual(merge.sessions.get("a"), session("a", "blocked", 5));
  });

  it("replaces a session with the snapshot value when the entry is fresh", () => {
    const current = new Map([["a", session("a", "working", 1)]]);
    const lastEventSeq = new Map([["a", 2]]);
    const merge = mergeSnapshot(current, lastEventSeq, /* loadStartedAtSeq */ 3, [session("a", "done", 9)]);
    assert.deepStrictEqual(merge.sessions.get("a"), session("a", "done", 9));
  });

  it("replaces a session with no event yet, the same as a fresh one", () => {
    const current = new Map([["a", session("a", "working", 1)]]);
    const merge = mergeSnapshot(current, new Map(), 3, [session("a", "done", 9)]);
    assert.deepStrictEqual(merge.sessions.get("a"), session("a", "done", 9));
  });

  it("reports a removed session, and does not carry it into the merged map", () => {
    const current = new Map([
      ["a", session("a", "working")],
      ["b", session("b", "idle")],
    ]);
    const merge = mergeSnapshot(current, new Map(), 0, [session("a", "working")]);
    assert.deepStrictEqual(merge.removed, ["b"]);
    assert.strictEqual(merge.sessions.has("b"), false);
  });

  it("reports the same status changes diffSessions would, including a new session", () => {
    const current = new Map([["a", session("a", "working")]]);
    const merge = mergeSnapshot(current, new Map(), 0, [session("a", "done"), session("c", "blocked")]);
    assert.deepStrictEqual(merge.changed, [
      { session: session("a", "done"), previous: "working" },
      { session: session("c", "blocked"), previous: undefined },
    ]);
  });

  it("lists a session that just went done or failed as one to forget the last message of", () => {
    const current = new Map([
      ["a", session("a", "working")],
      ["b", session("b", "working")],
      ["c", session("c", "working")],
    ]);
    const merge = mergeSnapshot(current, new Map(), 0, [
      session("a", "done"),
      session("b", "failed"),
      session("c", "idle"),
    ]);
    assert.deepStrictEqual(merge.toForget.sort(), ["a", "b"]);
  });

  it("does not list an unchanged or a still-running session to forget", () => {
    const current = new Map([["a", session("a", "working")]]);
    const merge = mergeSnapshot(current, new Map(), 0, [session("a", "working")]);
    assert.deepStrictEqual(merge.toForget, []);
  });
});
