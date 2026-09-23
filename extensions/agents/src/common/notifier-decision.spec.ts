import * as assert from "node:assert";
import { notifierDecision } from "./notifier-decision";

describe("notifierDecision", () => {
  it("shows a notice when a session becomes blocked and the preference is on", () => {
    assert.strictEqual(notifierDecision("blocked", "working", true), "show");
    assert.strictEqual(notifierDecision("blocked", undefined, true), "show");
  });

  it("shows nothing when a session becomes blocked and the preference is off", () => {
    assert.strictEqual(notifierDecision("blocked", "working", false), "none");
  });

  it("closes the notice when a session leaves the blocked status", () => {
    assert.strictEqual(notifierDecision("working", "blocked", true), "close");
    assert.strictEqual(notifierDecision("done", "blocked", false), "close");
  });

  it("does nothing when the blocked-ness does not change", () => {
    assert.strictEqual(notifierDecision("working", "working", true), "none");
    assert.strictEqual(notifierDecision("blocked", "blocked", true), "none");
    assert.strictEqual(notifierDecision("idle", undefined, true), "none");
  });
});
