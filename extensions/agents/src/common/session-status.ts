import { SessionStatus } from "./agents-protocol";

export type Outcome = "succeeded" | "failed" | "interrupted" | undefined;

// The facts about one session that the status rules read.
export interface SessionFacts {
  // The session is in the active map of the service.
  active: boolean;
  // An execution started and its end did not come yet.
  running: boolean;
  // The ids of the permission requests that wait for the user. More than
  // one can be open for a session at once; the session stays blocked while
  // this set is not empty, and one reply only removes its own request's id.
  pendingPermissionIds: ReadonlySet<string>;
  outcome: Outcome;
}

// The event type names come from the OpenCode event stream, verified live.
// session.execution.started, session.execution.succeeded, and
// session.execution.interrupted are verified live with a prompt run and an
// interrupt of a running prompt. session.execution.failed did not occur in
// a live run (every probe either succeeded or was interrupted); its name
// stays the plan's best guess, unverified, but it is confirmed present in
// the installed opencode v2.0.12 binary's strings. The permission event
// names are verified live: the binary contains "permission.asked" and
// "permission.replied", never "session.permission.requested" or
// "session.permission.replied", and a live probe (an ai1-probe- session, a
// real permission request, a real reply) confirmed both the names and
// their payload shape -- `permission.asked`: `{ id, sessionID, action,
// resources }`; `permission.replied`: `{ sessionID, requestID, reply }`.
export const EVENT_EXECUTION_STARTED = "session.execution.started";
export const EVENT_EXECUTION_SUCCEEDED = "session.execution.succeeded";
export const EVENT_EXECUTION_INTERRUPTED = "session.execution.interrupted";
export const EVENT_EXECUTION_FAILED = "session.execution.failed"; // unverified
export const EVENT_PERMISSION_ASKED = "permission.asked";
export const EVENT_PERMISSION_REPLIED = "permission.replied";

// blocked wins over working; working wins over an old outcome.
export function computeStatus(facts: SessionFacts): SessionStatus {
  if (facts.pendingPermissionIds.size > 0) {
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

// `properties` is the event's own data (the SSE envelope's `data` object):
// the permission events carry their request id there, not in `type`.
export function applyEvent(
  facts: SessionFacts,
  type: string,
  properties: Record<string, unknown> = {},
): SessionFacts {
  switch (type) {
    case EVENT_EXECUTION_STARTED:
      return { ...facts, running: true };
    // The execution stopped: the session is no longer in the service's own
    // active map either, so a run that ends between two loads (or a load
    // that raced an event and lost, see `isSnapshotStale`) does not leave
    // `active` stuck true, which would otherwise keep computing "working"
    // forever for it.
    case EVENT_EXECUTION_SUCCEEDED:
      return { ...facts, active: false, running: false, outcome: "succeeded" };
    case EVENT_EXECUTION_INTERRUPTED:
      return { ...facts, active: false, running: false, outcome: "interrupted" };
    case EVENT_EXECUTION_FAILED:
      return { ...facts, active: false, running: false, outcome: "failed" };
    case EVENT_PERMISSION_ASKED: {
      const id = typeof properties.id === "string" ? properties.id : undefined;
      if (!id) {
        return facts;
      }
      return { ...facts, pendingPermissionIds: new Set([...facts.pendingPermissionIds, id]) };
    }
    case EVENT_PERMISSION_REPLIED: {
      const requestID = typeof properties.requestID === "string" ? properties.requestID : undefined;
      if (!requestID || !facts.pendingPermissionIds.has(requestID)) {
        return facts;
      }
      const remaining = new Set(facts.pendingPermissionIds);
      remaining.delete(requestID);
      return { ...facts, pendingPermissionIds: remaining };
    }
    default:
      return facts;
  }
}
