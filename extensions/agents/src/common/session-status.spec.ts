import * as assert from "node:assert";
import { applyEvent, computeStatus, SessionFacts } from "./session-status";

const base: SessionFacts = {
  active: false,
  pendingPermissionIds: new Set(),
  outcome: undefined,
  running: false,
};

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
    assert.strictEqual(
      computeStatus({ ...base, active: true, pendingPermissionIds: new Set(["p1"]) }),
      "blocked",
    );
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

  it("ends the run on success, failure, or an interrupt, and clears active as well as running", () => {
    const running = { ...base, active: true, running: true };
    assert.deepStrictEqual(applyEvent(running, "session.execution.succeeded"), {
      ...base,
      active: false,
      running: false,
      outcome: "succeeded",
    });
    assert.deepStrictEqual(applyEvent(running, "session.execution.failed"), {
      ...base,
      active: false,
      running: false,
      outcome: "failed",
    });
    assert.deepStrictEqual(applyEvent(running, "session.execution.interrupted"), {
      ...base,
      active: false,
      running: false,
      outcome: "interrupted",
    });
  });

  it("is not working after a succeeded event even when the session was still in the active map", () => {
    // The I1 regression: a session the load found in the active map, with no
    // running flag of its own yet, must leave "working" once its execution
    // is reported done -- `active` alone must not keep it there.
    const facts: SessionFacts = {
      active: true,
      running: false,
      pendingPermissionIds: new Set(),
      outcome: undefined,
    };
    const after = applyEvent(facts, "session.execution.succeeded");
    assert.notStrictEqual(computeStatus(after), "working");
    assert.strictEqual(computeStatus(after), "done");
  });

  it("adds a permission request's own id and stays blocked with more than one open", () => {
    let facts = applyEvent(base, "permission.asked", { id: "req_1" });
    assert.deepStrictEqual([...facts.pendingPermissionIds], ["req_1"]);
    assert.strictEqual(computeStatus(facts), "blocked");
    facts = applyEvent(facts, "permission.asked", { id: "req_2" });
    assert.deepStrictEqual([...facts.pendingPermissionIds].sort(), ["req_1", "req_2"]);
    assert.strictEqual(computeStatus(facts), "blocked");
  });

  it("clears only the replied request's own id, staying blocked until every request is replied", () => {
    let facts = applyEvent(base, "permission.asked", { id: "req_1" });
    facts = applyEvent(facts, "permission.asked", { id: "req_2" });
    facts = applyEvent(facts, "permission.replied", { requestID: "req_1" });
    assert.deepStrictEqual([...facts.pendingPermissionIds], ["req_2"]);
    assert.strictEqual(computeStatus(facts), "blocked");
    facts = applyEvent(facts, "permission.replied", { requestID: "req_2" });
    assert.deepStrictEqual([...facts.pendingPermissionIds], []);
    assert.strictEqual(computeStatus(facts), "idle");
  });

  it("ignores an ask event with no id, and a reply for an id it does not hold", () => {
    assert.deepStrictEqual(applyEvent(base, "permission.asked", {}), base);
    const facts = applyEvent(base, "permission.asked", { id: "req_1" });
    assert.deepStrictEqual(applyEvent(facts, "permission.replied", { requestID: "req_other" }), facts);
  });

  it("ignores an unknown event", () => {
    assert.deepStrictEqual(applyEvent(base, "session.step.streamed"), base);
  });
});
