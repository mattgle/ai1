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
// The permission names are verified in Task 3.
export const EVENT_EXECUTION_STARTED = "session.execution.started";
export const EVENT_EXECUTION_SUCCEEDED = "session.execution.succeeded";
export const EVENT_EXECUTION_FAILED = "session.execution.failed"; // verified in Task 3
export const EVENT_PERMISSION_REQUESTED = "session.permission.requested"; // verified in Task 3
export const EVENT_PERMISSION_REPLIED = "session.permission.replied"; // verified in Task 3

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
    case EVENT_EXECUTION_FAILED:
      return { ...facts, running: false, outcome: "failed" };
    case EVENT_PERMISSION_REQUESTED:
      return { ...facts, pendingPermission: true };
    case EVENT_PERMISSION_REPLIED:
      return { ...facts, pendingPermission: false };
    default:
      return facts;
  }
}
