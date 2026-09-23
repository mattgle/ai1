import { SessionSummary } from "./agents-protocol";
import { diffSessions, StatusChange } from "./session-diff";
import { isSnapshotStale } from "./sequence-guard";

export interface SessionMerge {
  // The sessions `AgentsModel.doLoad` must keep from now on, keyed by id.
  sessions: Map<string, SessionSummary>;
  // The same per-session status changes a live update raises one at a
  // time, so a full load raises them too -- see `diffSessions`.
  changed: StatusChange[];
  // The ids `currentSessions` has that the merged map does not.
  removed: string[];
  // The ids among `changed` whose new status is "done" or "failed": the
  // caller's cached last message for each, if any, is from before the
  // session finished and must be forgotten.
  toForget: string[];
}

// The pure merge behind `AgentsModel.doLoad`: combines a full snapshot
// with the sessions the model already tracks, so a session an event
// already updated after the load started keeps that newer value instead
// of the load's own (now stale, for that one session) answer --
// `isSnapshotStale` decides which id that applies to. `loadStartedAtSeq`
// is the model's own sequence counter at the moment the load's RPC call
// was sent; `lastEventSeq` is the sequence number of the last
// event-driven update applied to each session id.
export function mergeSnapshot(
  currentSessions: ReadonlyMap<string, SessionSummary>,
  lastEventSeq: ReadonlyMap<string, number>,
  loadStartedAtSeq: number,
  snapshotSessions: readonly SessionSummary[],
): SessionMerge {
  const staleIds = new Set(
    [...currentSessions.keys(), ...snapshotSessions.map((session) => session.id)].filter((id) =>
      isSnapshotStale(lastEventSeq.get(id), loadStartedAtSeq),
    ),
  );
  const after = snapshotSessions
    .filter((session) => !staleIds.has(session.id))
    .concat([...currentSessions].filter(([id]) => staleIds.has(id)).map(([, session]) => session));
  const diff = diffSessions(currentSessions, after);
  const toForget = diff.changed
    .filter((change) => change.session.status === "done" || change.session.status === "failed")
    .map((change) => change.session.id);
  return {
    sessions: new Map(after.map((session) => [session.id, session])),
    changed: diff.changed,
    removed: diff.removed,
    toForget,
  };
}
