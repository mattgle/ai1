// The rule behind `AgentsModel.doLoad`'s protection against a late load
// overwriting a session a live event already updated more recently: a
// session's `lastEventSeq` is the sequence number of the last event-driven
// update the model applied to it (`undefined` if none happened yet);
// `loadStartedAtSeq` is the model's own sequence counter at the moment the
// load's RPC call was sent. A snapshot entry is stale (the load must not
// apply it) when an event for that session already arrived with a higher
// sequence number than the load had when it started -- that event is
// provably newer information than whatever the load's answer holds for it.
export function isSnapshotStale(lastEventSeq: number | undefined, loadStartedAtSeq: number): boolean {
  return lastEventSeq !== undefined && lastEventSeq > loadStartedAtSeq;
}
