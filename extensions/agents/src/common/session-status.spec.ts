import * as assert from "node:assert";
import { applyEvent, computeStatus, SessionFacts } from "./session-status";

const base: SessionFacts = { active: false, pendingPermission: false, outcome: undefined, running: false };

describe("computeStatus", () => {
  it("is idle when nothing happened", () => {
    assert.strictEqual(computeStatus(base), "idle");
  });

  it("is working when the session is in the active map", () => {
    assert.strictEqual(computeStatus({ ...base, active: true }), "working");
  });

  it("is working after an execution started and did not end", () => {
    assert.strictEqual(computeStatus({ ...base, running: true }), "working");
  });

  it("is blocked when a permission is pending, also while working", () => {
    assert.strictEqual(computeStatus({ ...base, active: true, pendingPermission: true }), "blocked");
  });

  it("is done or failed from the outcome when nothing runs", () => {
    assert.strictEqual(computeStatus({ ...base, outcome: "succeeded" }), "done");
    assert.strictEqual(computeStatus({ ...base, outcome: "failed" }), "failed");
    assert.strictEqual(computeStatus({ ...base, outcome: "interrupted" }), "done");
  });

  it("prefers working over an old outcome", () => {
    assert.strictEqual(computeStatus({ ...base, outcome: "succeeded", running: true }), "working");
  });
});

describe("applyEvent", () => {
  it("marks a started execution as running", () => {
    assert.deepStrictEqual(applyEvent(base, "session.execution.started"), { ...base, running: true });
  });

  it("ends the run on success and records the outcome", () => {
    const running = { ...base, running: true };
    assert.deepStrictEqual(applyEvent(running, "session.execution.succeeded"), {
      ...base,
      running: false,
      outcome: "succeeded",
    });
    assert.deepStrictEqual(applyEvent(running, "session.execution.failed"), {
      ...base,
      running: false,
      outcome: "failed",
    });
    assert.deepStrictEqual(applyEvent(running, "session.execution.interrupted"), {
      ...base,
      running: false,
      outcome: "interrupted",
    });
  });

  it("sets and clears the pending permission", () => {
    const blocked = applyEvent(base, "session.permission.requested");
    assert.strictEqual(blocked.pendingPermission, true);
    assert.strictEqual(applyEvent(blocked, "session.permission.replied").pendingPermission, false);
  });

  it("ignores an unknown event", () => {
    assert.deepStrictEqual(applyEvent(base, "session.step.streamed"), base);
  });
});
