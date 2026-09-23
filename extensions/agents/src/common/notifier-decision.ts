import { SessionStatus } from "./agents-protocol";

export type NotifierDecision = "show" | "close" | "none";

// The pure rule behind `BlockedNotifier`. `status` is a session's new
// status, `previous` is its status before this change, and `notifyOnBlocked`
// is the current value of the `ai1.agents.notifyOnBlocked` preference.
//
// `show`: the session just became blocked, and the preference allows a
// notice.
// `close`: the session just left the blocked status. This fires even when
// no notice was ever shown (the preference was off, or none is tracked),
// because the browser class only closes a notice it holds; a close decision
// with nothing open is a no-op there.
// `none`: no change in blocked-ness.
export function notifierDecision(
  status: SessionStatus,
  previous: SessionStatus | undefined,
  notifyOnBlocked: boolean,
): NotifierDecision {
  if (status === "blocked" && previous !== "blocked") {
    return notifyOnBlocked ? "show" : "none";
  }
  if (status !== "blocked" && previous === "blocked") {
    return "close";
  }
  return "none";
}
