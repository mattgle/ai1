import { SessionStatus } from "./agents-protocol";

export type Outcome = "succeeded" | "failed" | "interrupted" | undefined;

// The facts about one session that the status rules read.
export interface SessionFacts {
  // The session is in the active map of the service.
  active: boolean;
  // An execution started and its end did not come yet.
  running: boolean;
  // A permission request waits for the user.
  pendingPermission: boolean;
  outcome: Outcome;
}

// The event type names come from the OpenCode event stream.
// session.execution.started, session.execution.succeeded, and
// session.execution.interrupted are verified live in Task 3 (a prompt run
// and an interrupt of a running prompt). session.execution.failed did not
// occur in a live run (every probe either succeeded or was interrupted);
// its name stays the plan's best guess, unverified, but it is confirmed
// present in the installed opencode v2.0.12 binary's strings. The
// permission event names are verified live in the Task 6 fix round: the
// binary contains "permission.asked" and "permission.replied", never
// "session.permission.requested" or "session.permission.replied", and a
// live probe (an ai1-probe- session, a real permission request, a real
// reply) confirmed both the names and their payload shape --
// `permission.asked`: `{ id, sessionID, action, resources }`;
// `permission.replied`: `{ sessionID, requestID, reply }`.
export const EVENT_EXECUTION_STARTED = "session.execution.started";
export const EVENT_EXECUTION_SUCCEEDED = "session.execution.succeeded";
export const EVENT_EXECUTION_INTERRUPTED = "session.execution.interrupted";
export const EVENT_EXECUTION_FAILED = "session.execution.failed"; // unverified
export const EVENT_PERMISSION_ASKED = "permission.asked";
export const EVENT_PERMISSION_REPLIED = "permission.replied";

// blocked wins over working; working wins over an old outcome.
export function computeStatus(facts: SessionFacts): SessionStatus {
  if (facts.pendingPermission) {
    return "blocked";
  }
  if (facts.active || facts.running) {
    return "working";
  }
  if (facts.outcome === "failed") {
    return "failed";
  }
  if (facts.outcome === "succeeded" || facts.outcome === "interrupted") {
    return "done";
  }
  return "idle";
}

export function applyEvent(facts: SessionFacts, type: string): SessionFacts {
  switch (type) {
    case EVENT_EXECUTION_STARTED:
      return { ...facts, running: true };
    case EVENT_EXECUTION_SUCCEEDED:
      return { ...facts, running: false, outcome: "succeeded" };
    case EVENT_EXECUTION_INTERRUPTED:
      return { ...facts, running: false, outcome: "interrupted" };
    case EVENT_EXECUTION_FAILED:
      return { ...facts, running: false, outcome: "failed" };
    case EVENT_PERMISSION_ASKED:
      return { ...facts, pendingPermission: true };
    case EVENT_PERMISSION_REPLIED:
      return { ...facts, pendingPermission: false };
    default:
      return facts;
  }
}
