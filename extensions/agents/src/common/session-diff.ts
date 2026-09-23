import { SessionStatus, SessionSummary } from "./agents-protocol";

export interface StatusChange {
  session: SessionSummary;
  previous: SessionStatus | undefined;
}

export interface SessionDiff {
  // One entry per session whose status differs from `before` (including a
  // session that `before` does not have at all, where `previous` is
  // `undefined` -- the M4 "already blocked at startup" case: a full load
  // must raise the same status-change event a live update would, or a
  // session that is already blocked when AI1 starts never gets its notice).
  changed: StatusChange[];
  // The ids that `before` has and `after` does not.
  removed: string[];
}

// The pure diff behind `AgentsModel.doLoad`: a full reload replaces the
// whole session map at once, so it needs its own comparison to still raise
// the same per-session events a live update raises one at a time.
export function diffSessions(
  before: ReadonlyMap<string, SessionSummary>,
  after: readonly SessionSummary[],
): SessionDiff {
  const afterIds = new Set<string>();
  const changed: StatusChange[] = [];
  for (const session of after) {
    afterIds.add(session.id);
    const previous = before.get(session.id)?.status;
    if (previous !== session.status) {
      changed.push({ session, previous });
    }
  }
  const removed = [...before.keys()].filter((id) => !afterIds.has(id));
  return { changed, removed };
}
