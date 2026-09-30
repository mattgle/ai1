import { Emitter, Event } from "@theia/core";
import { inject, injectable } from "@theia/core/shared/inversify";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import {
  AgentsClient,
  AgentsService,
  AgentsSnapshot,
  SessionGroup,
  SessionStatus,
  SessionSummary,
} from "../common/agents-protocol";
import { LoadGate, runGatedOnce } from "../common/load-gate";
import { OncePerKey } from "../common/once-per-key";
import { groupSessions } from "../common/session-groups";
import { mergeSnapshot } from "../common/session-merge";

// The front-end copy of the sessions. The back end pushes one card per
// change; the model regroups and tells the widget.
@injectable()
export class AgentsModel implements AgentsClient {
  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  protected readonly sessions = new Map<string, SessionSummary>();
  protected workspaceRoots: string[] = [];
  protected readonly lastMessages = new Map<string, string>();
  protected readonly lastMessageOnce = new OncePerKey();
  protected readonly onDidChangeEmitter = new Emitter<void>();
  readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
  protected readonly onDidChangeStatusEmitter = new Emitter<{
    session: SessionSummary;
    previous: SessionStatus | undefined;
  }>();
  readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;
  // `BlockedNotifier` needs this to close a notice whose session is gone,
  // which `onDidChangeStatus` cannot express: there is no new `SessionSummary`
  // to report a status change on.
  protected readonly onDidRemoveSessionEmitter = new Emitter<string>();
  readonly onDidRemoveSession: Event<string> = this.onDidRemoveSessionEmitter.event;
  readonly openTerminals = new Set<string>();
  connected = false;
  error: string | undefined;
  // Set from the last load's own `AgentsSnapshot.truncated` (see that
  // field's own comment): the global, service-wide session cap actually
  // cut off real data, so this workspace may be missing an older session
  // with no way to tell from here alone. An event
  // (`onSessionChanged`/`onSessionRemoved`) never changes this -- only a
  // fresh `load()` can, since only a load re-reads the capped list.
  truncated = false;
  // Gates `load()` so a request that arrives while a load is already
  // running (for example a reconnect's `onConnectionChanged(true)` racing
  // the widget's own first load) does not join that running load and get
  // its now-stale answer; it only marks that one more load must run once
  // the current one ends (see `LoadGate` and `runGatedOnce`). `retryChain`
  // is what such a joining call is given instead of its own load: the
  // promise of the retry `loadGate` asks for once the current load ends,
  // which settles with that retry's own result (success or its own
  // error), not with the running load's -- a joiner asked for a fresh
  // load, so a stale, unrelated failure from the load it happened to
  // arrive during must not be what it is told. In practice the sources of
  // a joining call are sparse (the widget's own start, a reconnect, the
  // Refresh command, `pickSession`), but nothing stops one more from
  // joining while a retry is still settling, in which case that caller
  // waits through that one too, and so on for as long as requests keep
  // arriving one after another.
  protected readonly loadGate = new LoadGate();
  protected retryChain: Promise<void> | undefined;
  protected loadedOnce = false;
  // A monotonic counter of event-driven updates (`onSessionChanged`/
  // `onSessionRemoved`), and the sequence number of the last one applied
  // to each session id. A `load()` in flight can resolve with an answer
  // already made stale by a live event that arrived after the load
  // started (the RPC round trip has no other ordering guarantee against
  // the event stream); `doLoad` reads `sequence` before it starts its own
  // RPC call and uses `lastEventSeq` to keep such a session's event-given
  // value from being reverted by that now-stale load answer.
  protected sequence = 0;
  protected readonly lastEventSeq = new Map<string, number>();

  get groups(): SessionGroup[] {
    return groupSessions([...this.sessions.values()], this.workspaceRoots);
  }

  // Whether the first `load()` has completed at least once.
  get loaded(): boolean {
    return this.loadedOnce;
  }

  lastMessageOf(id: string): string | undefined {
    return this.lastMessages.get(id);
  }

  sessionsWithStatus(status: SessionStatus): SessionSummary[] {
    return [...this.sessions.values()].filter((session) => session.status === status);
  }

  // `AgentsTerminals` calls these so the widget's "N terminals open" summary
  // updates; mutating the `openTerminals` set directly fires no change event.
  markTerminalOpen(id: string): void {
    this.openTerminals.add(id);
    this.onDidChangeEmitter.fire();
  }

  markTerminalClosed(id: string): void {
    if (this.openTerminals.delete(id)) {
      this.onDidChangeEmitter.fire();
    }
  }

  // A call that arrives while a load is already running does not start its
  // own load; `loadGate` only marks that one more load must run once the
  // current one ends (see the field comment above and `LoadGate` itself).
  // `runGatedOnce` (not a method here: it needs no `AgentsModel` state of
  // its own, and living in `../common/load-gate` alongside `LoadGate`
  // lets it be unit-tested on its own, which this class itself cannot be
  // in this project's plain Node mocha run -- `@theia/workspace` needs a
  // DOM) also keeps a `doLoad` failure from skipping a retry a joiner is
  // owed -- see its own comment.
  load(): Promise<void> {
    if (!this.loadGate.start()) {
      return this.retryChain ?? Promise.resolve();
    }
    const run = runGatedOnce(
      this.loadGate,
      () => this.doLoad(),
      () => this.load(),
    );
    this.retryChain = run.retryChain;
    return run.own;
  }

  protected async doLoad(): Promise<void> {
    const loadStartedAtSeq = this.sequence;
    const workspaceRoots = await this.workspace.roots;
    let snapshot: AgentsSnapshot;
    try {
      snapshot = await this.service.load(workspaceRoots.map((root) => root.resource.toString()));
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.onDidChangeEmitter.fire();
      return;
    }
    this.workspaceRoots = snapshot.workspaceRoots;
    const incoming = snapshot.groups.flatMap((group) => group.sessions);
    // A full load replaces the whole map at once, so `mergeSnapshot` gives
    // it its own per-session diff, to raise the same `onDidChangeStatus`/
    // `onDidRemoveSession` events a live update raises one at a time --
    // otherwise a session that is already blocked the moment AI1 starts
    // (or reconnects after a cut) never gets a notice for it. It also
    // keeps a session an event already updated after this load started
    // (the RPC round trip gives no ordering guarantee against the event
    // stream) at its own, more current, value instead of the load's own
    // (now stale, for that one session) answer winning the race and
    // reverting it -- see `isSnapshotStale`.
    const merge = mergeSnapshot(this.sessions, this.lastEventSeq, loadStartedAtSeq, incoming);
    this.sessions.clear();
    for (const [id, session] of merge.sessions) {
      this.sessions.set(id, session);
    }
    this.connected = snapshot.connected;
    this.truncated = snapshot.truncated;
    this.loadedOnce = true;
    // Same rule `onSessionChanged` applies to a live update: a session
    // that just moved to done or failed has a cached last message (if
    // any) from before it finished, so drop it and let the next
    // `ensureLastMessage` fetch the real, final one.
    for (const id of merge.toForget) {
      this.lastMessages.delete(id);
      this.lastMessageOnce.forget(id);
    }
    for (const change of merge.changed) {
      this.onDidChangeStatusEmitter.fire(change);
    }
    for (const id of merge.removed) {
      this.onDidRemoveSessionEmitter.fire(id);
    }
    this.onDidChangeEmitter.fire();
  }

  // A card asks for its last message on every re-render. `lastMessageOnce`
  // guards the RPC call so a card in flight, or already answered, does not
  // send it again.
  async ensureLastMessage(id: string): Promise<void> {
    if (this.lastMessages.has(id)) {
      return;
    }
    this.lastMessageOnce.run(id, async (stillCurrent) => {
      // A failed request rejects, so `lastMessageOnce` lets a later
      // re-render try again. `stillCurrent` is false when `forget` ran for
      // this id while the request was in flight (the session finished
      // while its old last message was still loading, see
      // `onSessionChanged` and `doLoad`'s own `forget` calls); this
      // request's answer is then for a state this id has already moved
      // past, and storing it would overwrite whatever a fresher request
      // fetches instead.
      const text = await this.service.lastMessage(id);
      if (text !== undefined && stillCurrent()) {
        this.lastMessages.set(id, text);
        this.onDidChangeEmitter.fire();
      }
    });
  }

  onSessionChanged(summary: SessionSummary): void {
    this.sequence += 1;
    this.lastEventSeq.set(summary.id, this.sequence);
    const previous = this.sessions.get(summary.id)?.status;
    this.sessions.set(summary.id, summary);
    if (previous !== summary.status) {
      this.onDidChangeStatusEmitter.fire({ session: summary, previous });
    }
    if (summary.status === "done" || summary.status === "failed") {
      this.lastMessages.delete(summary.id);
      // The next `ensureLastMessage` call for this id must fetch again: the
      // cached text (if any) came from before the session finished.
      this.lastMessageOnce.forget(summary.id);
    }
    this.onDidChangeEmitter.fire();
  }

  onSessionRemoved(id: string): void {
    this.sequence += 1;
    this.lastEventSeq.set(id, this.sequence);
    this.sessions.delete(id);
    this.lastMessages.delete(id);
    this.lastMessageOnce.forget(id);
    this.openTerminals.delete(id);
    this.onDidRemoveSessionEmitter.fire(id);
    this.onDidChangeEmitter.fire();
  }

  onConnectionChanged(connected: boolean): void {
    const wasConnected = this.connected;
    this.connected = connected;
    // The widget's own first load already populates the model; only a
    // reconnect after a cut needs a repair load (events could be lost
    // during the cut). The gate in `load()` would also fold a duplicate
    // first-connect load into the widget's own call, but skipping it here
    // avoids starting it at all.
    if (connected && !wasConnected && this.loadedOnce) {
      this.loadInBackground("the reconnect load");
    }
    this.onDidChangeEmitter.fire();
  }

  // The back end's own event queue overflowed while a load was in
  // progress and was dropped (see `AgentsClient.onReloadRequested`'s own
  // comment): a fresh load through the model's own gate is the only way
  // to be current again, the same repair a reconnect runs.
  onReloadRequested(): void {
    this.loadInBackground("the reload after an event-queue overflow");
  }

  // Fires `load()` and forgets it: nothing here awaits it, and `load()`
  // can throw (see `runGatedOnce`), so a caught rejection here cannot
  // become an unhandled one.
  protected loadInBackground(what: string): void {
    this.load().catch((error) => {
      console.error(`ai1-agents: ${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
