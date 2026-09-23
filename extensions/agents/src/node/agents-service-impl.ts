import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { inject, injectable, preDestroy } from "@theia/core/shared/inversify";
import { AgentsClient, AgentsService, AgentsSnapshot, SessionSummary } from "../common/agents-protocol";
import { mapLimit } from "../common/concurrency-limit";
import { groupSessions } from "../common/session-groups";
import { applyEvent, computeStatus, SessionFacts } from "../common/session-status";
import { TmuxSession } from "../common/tmux-list";
import { OpenCodeHttpError, RawSession } from "./opencode-client";
import { Disposable, OpenCodeHub } from "./opencode-hub";
import { resolveProgram } from "./resolve-program";
import { listTmuxSessions, tmuxNewCommand } from "./tmux-runner";

interface Tracked {
  raw: RawSession;
  facts: SessionFacts;
  messageCount: number;
}

// How many `pendingPermissionRequestIds` calls (one per distinct session
// directory) run at once during a load, so a workspace with many
// repositories does not fire one HTTP request per repository all at once.
const PERMISSION_CHECK_CONCURRENCY = 4;

// How many `messageCount` calls (one per tracked session) run at once
// during a load, so a workspace with many sessions does not fire one HTTP
// request per session all at once.
const MESSAGE_COUNT_CONCURRENCY = 4;

// How many events `onEvent` queues while a load is in progress (see
// `load`) before it gives up on replaying them one by one. Nothing today
// makes a load run long enough for this to matter in practice
// (`OpenCodeClient`'s own request timeout bounds a hung fetch), but an
// unbounded queue would otherwise grow forever for as long as any load
// stays open. Past this many, `onEvent` drops the whole queue and `load`
// asks for a fresh load instead, once every overlapping load on this
// instance has ended -- simpler, and just as correct, as replaying a
// queue this stale would be, and it keeps memory bounded.
const MAX_QUEUED_EVENTS = 1000;

// Whether `onEvent` acts on an event of this `type` at all: every
// `session.*` type (`session.created`, `session.deleted`, and every
// session status event) and every `permission.*` type (`permission.asked`,
// `permission.replied`), each carrying its own `sessionID` -- verified
// live, see `session-status.ts`. Anything else (for example the live
// service's own `server.connected` on a fresh SSE connection) reaches
// `onEvent` with nothing for it to act on: replayed later, it would just
// fall through to the same no-op a live one does today, so queuing it
// while a load is in progress (see `load`) would only spend queue
// capacity for nothing.
function isQueueableEvent(type: string, properties: Record<string, unknown>): boolean {
  return (
    (type.startsWith("session.") || type.startsWith("permission.")) &&
    typeof properties.sessionID === "string"
  );
}

// Strips a trailing slash, so `isInside` and `groupSessions` compare the
// same value. Keeps "/" for the file-system root, which would otherwise
// strip to the empty string. Resolves the result with the real file system
// path, so a workspace root reached through a symbolic link (macOS's `/var`
// is one, and so can a user's own link) compares equal to a session
// directory, which OpenCode reports already resolved. Falls back to the
// literal path when it does not exist on disk (the common case in tests).
function normalizeRoot(root: string): string {
  const stripped = root.replace(/\/+$/, "");
  const literal = stripped === "" ? "/" : stripped;
  try {
    return fs.realpathSync(literal);
  } catch {
    return literal;
  }
}

// Bound per RPC connection (`ConnectionContainerModule` in
// `agents-backend-module.ts`, the standard Theia pattern for a service
// whose state is per-workspace, not global -- `@theia/debug` and the
// preferences back end are bound the same way): one instance per open
// window, each with its own `roots`, its own `tracked` sessions, and its
// own single `client`. Two windows on different workspaces therefore never
// mix state. A list of clients (the pattern of `@theia/task`'s
// `TaskServerImpl`, whose tasks are global, not per workspace) is not
// needed, because each instance has at most one client for its whole
// lifetime.
//
// The one OpenCode HTTP connection and its one `GET /api/event`
// subscription live in `OpenCodeHub` instead, a main-container singleton
// injected here, shared by every window -- so N windows still cost one
// connection and one subscription, not N.
//
// Inversify calls this constructor with no arguments; it rejects a
// constructor with parameters that carry no @inject annotation. The hub
// and the program resolver are set through `init`, which the tests call
// and the production module leaves at their defaults (the hub via
// property injection, resolved from the main container).
@injectable()
export class AgentsServiceImpl implements AgentsService {
  @inject(OpenCodeHub)
  protected hub!: OpenCodeHub;

  protected client: AgentsClient | undefined;
  protected readonly tracked = new Map<string, Tracked>();
  protected roots: string[] = [];
  protected resolvePath: (name: "opencode" | "tmux") => string = resolveProgram;
  protected connected = false;
  protected hubEventDisposable: Disposable | undefined;
  protected hubStateDisposable: Disposable | undefined;
  // How many `load()` calls on this instance are currently in flight, from
  // each one's own subscribe onward (see `load`) until its own rebuild of
  // `tracked` ends. An event that reaches `onEvent` while this is above
  // zero is queued instead of applied straight away: `tracked` still holds
  // some previous rebuild's sessions (or none, on the very first load), so
  // applying the event now would either touch a now-stale entry a rebuild
  // still in flight is about to overwrite, or find no tracked entry at all
  // and be dropped for good. A depth counter, not a single flag: two
  // overlapping `load()` calls on this one instance must not let the
  // first one to finish drain the queue (or reset it on its own start)
  // while the second is still rebuilding `tracked` -- `load` only drains
  // once this returns to zero.
  protected loadDepth = 0;
  protected queuedEvents: { type: string; properties: Record<string, unknown> }[] = [];
  // Set when the queue above hit `MAX_QUEUED_EVENTS` and was dropped
  // while `loadDepth` was still above zero. `load`'s own drain, once
  // `loadDepth` returns to zero, asks for one more load instead of
  // replaying the (now empty) queue, since nothing can be replayed for
  // whatever arrived in the dropped window.
  protected queueOverflowed = false;

  init(hub: OpenCodeHub, resolvePath: (name: "opencode" | "tmux") => string = resolveProgram): void {
    this.hub = hub;
    this.resolvePath = resolvePath;
  }

  setClient(client: AgentsClient): void {
    this.client = client;
  }

  // Runs when this connection's own per-connection container is disposed
  // (the window closed): Theia tears down a `ConnectionContainerModule`
  // child container by calling `unbindAllAsync()` on it when the
  // underlying channel closes (`DefaultMessagingService`), which runs
  // every bound singleton's `@preDestroy` hook -- the standard inversify
  // lifecycle hook for "this connection is gone," the counterpart of
  // `@postConstruct` on the other side (`AgentsWidget.init`, for example).
  // This must stop listening to the shared hub, never touch the hub
  // itself: the hub, its one OpenCode connection, and its one
  // subscription outlive every single window.
  @preDestroy()
  dispose(): void {
    this.hubEventDisposable?.dispose();
    this.hubEventDisposable = undefined;
    this.hubStateDisposable?.dispose();
    this.hubStateDisposable = undefined;
  }

  async load(workspaceRootUris: string[]): Promise<AgentsSnapshot> {
    this.roots = workspaceRootUris.map((uri) => normalizeRoot(fileURLToPath(uri)));
    // Subscribed before the first await below, so an event that arrives
    // while the fetches below run (including the very first load, before
    // this connection ever subscribed) reaches `onEvent` and is queued,
    // instead of never reaching a listener at all. The `try`/`finally`
    // below drains that queue once every overlapping `load()` call on this
    // instance has ended (`loadDepth` back to zero), whether the last one
    // to end succeeds or fails: on success, `tracked` is current again,
    // and each queued event replays through the normal `onEvent` -- the
    // same one a live event runs, including `notifyChanged` -- so a
    // session already tracked after the rebuild gets exactly the update
    // it missed, and `session.created` still adds a session the rebuild
    // did not know about yet, through its own existing rule. An event for
    // a session that is not tracked after the rebuild, and is not a
    // `session.created`, is dropped, the same as it is today for a live
    // event with no tracked match. On a failure before `tracked` is
    // touched, the queued events simply replay against the still-current,
    // unchanged `tracked` -- as if they had never been queued. Only reset
    // when this is the outermost call (`loadDepth` was zero): a second,
    // overlapping call must not clear what the first is already queuing.
    this.ensureSubscribed();
    if (this.loadDepth === 0) {
      this.queuedEvents = [];
    }
    this.loadDepth += 1;
    try {
      return await this.doLoadFetch();
    } finally {
      this.loadDepth -= 1;
      if (this.loadDepth === 0) {
        const queued = this.queuedEvents;
        const overflowed = this.queueOverflowed;
        this.queuedEvents = [];
        this.queueOverflowed = false;
        for (const event of queued) {
          // `replay: true`: the fetched `messageCount` this rebuild just
          // set (`doLoadFetch`'s own `api.messageCount` call) already
          // counts this event's step, so counting it a second time here
          // would be wrong -- see `onEvent`.
          this.onEvent(event.type, event.properties, { replay: true });
        }
        if (overflowed) {
          // Nothing was replayed for whatever the dropped queue held.
          // Reloading here, on this side, would not fix that: this
          // service's own answer reaches no client, and rebuilding
          // `tracked` again raises no `notifyChanged` for any of it (a
          // load's answer is returned, not pushed) -- the window would
          // still show whatever was last on screen, now stale. So the
          // client is told instead: it knows how to run its own load the
          // same way a reconnect's repair load already does.
          this.notifyReloadRequested();
        }
      }
    }
  }

  // The fetch-and-rebuild body of `load`, split out so `load` itself can
  // wrap it in one `try`/`finally` that always drains the event queue
  // above, on success or on failure.
  protected async doLoadFetch(): Promise<AgentsSnapshot> {
    const api = await this.hub.apiClient();
    const [{ sessions, truncated }, active] = await Promise.all([api.listSessions(), api.activeIds()]);
    // The pending-permission list is scoped by a directory that must equal
    // a session's own directory exactly (no prefix match against an
    // ancestor such as a workspace root, verified live), so it is called
    // once per distinct directory of the sessions this workspace shows,
    // not once per workspace root and not once per session -- fewer calls
    // than per-session in the common case, where several sessions of one
    // repository share one directory.
    const insideDirectories = new Set(
      sessions.filter((raw) => this.isInside(raw.directory)).map((raw) => raw.directory),
    );
    // A directory the OpenCode service does not have on disk any more (a
    // deleted repository, still in a session's stored directory) gives an
    // HTTP 500 for this call. One bad directory must not fail the whole
    // load: its own map is empty, with a warning, and every other
    // directory's answer still counts.
    const pendingMaps = await mapLimit([...insideDirectories], PERMISSION_CHECK_CONCURRENCY, (directory) =>
      api.pendingPermissionRequestIds(directory).catch((error) => {
        console.warn(
          `ai1-agents: could not read the pending permissions of '${directory}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return new Map<string, Set<string>>();
      }),
    );
    // Each distinct directory's own sessions are disjoint from every other
    // directory's, so the per-directory maps can merge by simple
    // assignment, with no id lost across the merge.
    const pendingBySession = new Map<string, Set<string>>();
    for (const map of pendingMaps) {
      for (const [sessionID, ids] of map) {
        pendingBySession.set(sessionID, ids);
      }
    }
    // `tracked` holds only sessions inside a workspace root, never a
    // session of an unrelated directory -- so `onEvent` (below), which
    // looks a session up in `tracked` before it notifies anyone, cannot
    // notify a client about a session outside its own workspace. A session
    // this connection has no business knowing about must not make its
    // group flicker into view, and must not raise a blocked notice for a
    // repository this window never opened.
    this.tracked.clear();
    for (const raw of sessions) {
      if (!this.isInside(raw.directory)) {
        continue;
      }
      this.tracked.set(raw.id, {
        raw,
        facts: {
          active: active.has(raw.id),
          running: false,
          pendingPermissionIds: pendingBySession.get(raw.id) ?? new Set<string>(),
          outcome: raw.outcome,
        },
        messageCount: 0,
      });
    }
    const inside = [...this.tracked.values()];
    await mapLimit(inside, MESSAGE_COUNT_CONCURRENCY, async (t) => {
      t.messageCount = await api.messageCount(t.raw.id).catch(() => 0);
    });
    return {
      groups: groupSessions(
        inside.map((t) => this.summary(t)),
        this.roots,
      ),
      connected: this.connected,
      truncated,
    };
  }

  // A session already removed from `tracked` (its card is already gone,
  // the same as after a live `session.deleted`) is not asked about again:
  // no further request, no further retry.
  async lastMessage(id: string): Promise<string | undefined> {
    if (!this.tracked.has(id)) {
      return undefined;
    }
    const api = await this.hub.apiClient();
    try {
      return await api.lastMessageText(id);
    } catch (error) {
      // A 404 alone is not proof the session is gone: that one route could
      // fail on its own, unrelated to the session's own existence. A
      // second, independent call (`sessionExists`, `GET
      // /api/session/{id}`) must also say it is gone before this treats it
      // that way; otherwise the original 404 is just a normal error,
      // rethrown below like any other.
      if (error instanceof OpenCodeHttpError && error.status === 404 && !(await api.sessionExists(id))) {
        // Confirmed gone, the same case a live `session.deleted` event
        // reports. Routed through `onEvent`, not applied directly here, so
        // a load in progress on this instance queues it and replays it
        // after the rebuild, the same as a live event would -- this
        // method's own guard above then stops any further request for
        // this id from here on.
        this.onEvent("session.deleted", { sessionID: id });
        return undefined;
      }
      throw error;
    }
  }

  async createSession(directory: string, title?: string): Promise<SessionSummary> {
    const api = await this.hub.apiClient();
    const raw = await api.createSession(title, directory);
    const tracked: Tracked = {
      raw: { ...raw, directory: raw.directory || directory },
      facts: { active: false, running: false, pendingPermissionIds: new Set(), outcome: undefined },
      messageCount: 0,
    };
    this.tracked.set(raw.id, tracked);
    const summary = this.summary(tracked);
    this.notifyChanged(summary);
    return summary;
  }

  async deleteSession(id: string): Promise<void> {
    await (await this.hub.apiClient()).deleteSession(id);
    if (this.tracked.delete(id)) {
      this.notifyRemoved(id);
    }
  }

  async sessionCommand(id: string, directory: string): Promise<{ program: string; args: string[] }> {
    return { program: this.resolvePath("opencode"), args: ["--session", id, directory] };
  }

  async tmuxCommand(name: string, directory?: string): Promise<{ program: string; args: string[] }> {
    const command = tmuxNewCommand(name, directory);
    return { ...command, program: this.resolvePath("tmux") };
  }

  tmuxSessions(): Promise<TmuxSession[]> {
    return listTmuxSessions();
  }

  protected ensureSubscribed(): void {
    if (this.hubEventDisposable) {
      return;
    }
    this.hubEventDisposable = this.hub.onEvent((type, properties) => this.onEvent(type, properties));
    this.hubStateDisposable = this.hub.onState((connected) => {
      this.connected = connected;
      this.client?.onConnectionChanged(connected);
    });
  }

  // The event names and the sessionID field are verified live.
  // `options.replay` is set only when `load` replays a queued event after
  // a rebuild (see `load`): the fresh `messageCount` that rebuild just
  // fetched already counts a `session.step.ended` this queued event
  // reports, so this call must not count it again, though it still
  // applies every other fact and still notifies as usual.
  protected onEvent(
    type: string,
    properties: Record<string, unknown>,
    options: { replay?: boolean } = {},
  ): void {
    if (this.loadDepth > 0) {
      if (!isQueueableEvent(type, properties)) {
        return;
      }
      if (this.queuedEvents.length >= MAX_QUEUED_EVENTS) {
        this.queuedEvents = [];
        this.queueOverflowed = true;
        return;
      }
      this.queuedEvents.push({ type, properties });
      return;
    }
    if (type === "session.created") {
      this.onSessionCreated(properties);
      return;
    }
    if (type === "session.deleted") {
      this.onSessionDeleted(properties);
      return;
    }
    const id = typeof properties.sessionID === "string" ? properties.sessionID : undefined;
    if (!id) {
      return;
    }
    const tracked = this.tracked.get(id);
    if (!tracked) {
      return;
    }
    const before = computeStatus(tracked.facts);
    tracked.facts = applyEvent(tracked.facts, type, properties);
    if (type === "session.step.ended" && !options.replay) {
      tracked.messageCount += 1;
    }
    tracked.raw.time.updated = Date.now();
    const after = computeStatus(tracked.facts);
    if (before !== after || type === "session.step.ended" || type === "session.usage.updated") {
      this.notifyChanged(this.summary(tracked));
    }
  }

  // A session created elsewhere while this workspace was already loaded (a
  // second window's "New Session", or OpenCode's own interface). Verified
  // live: `data.{sessionID, location: {directory}, title, ...}`. Added
  // only when its directory is inside a workspace root -- the same rule
  // `load` applies to the initial list -- and skipped if this service
  // already tracks the id, which covers AI1's own `createSession` getting
  // this same event back over the stream it is itself subscribed to.
  protected onSessionCreated(properties: Record<string, unknown>): void {
    const sessionID = typeof properties.sessionID === "string" ? properties.sessionID : undefined;
    const location = properties.location as { directory?: string } | undefined;
    const directory = typeof location?.directory === "string" ? location.directory : undefined;
    if (!sessionID || !directory || this.tracked.has(sessionID) || !this.isInside(directory)) {
      return;
    }
    const now = Date.now();
    const tracked: Tracked = {
      raw: {
        id: sessionID,
        title: typeof properties.title === "string" ? properties.title : "(no title)",
        directory,
        model: { id: "?", providerID: "?" },
        time: { created: now, updated: now },
      },
      facts: { active: false, running: false, pendingPermissionIds: new Set(), outcome: undefined },
      messageCount: 0,
    };
    this.tracked.set(sessionID, tracked);
    this.notifyChanged(this.summary(tracked));
  }

  // A session deleted elsewhere. Verified live: `data.{sessionID}`.
  // Idempotent with AI1's own `deleteSession`, which already removes the
  // tracked entry and notifies before this same event (the live service
  // raises `session.deleted` for every deletion, including one AI1 itself
  // made) reaches this subscriber: `Map.delete` gives `false` the second
  // time, so no second removal notice fires for it.
  protected onSessionDeleted(properties: Record<string, unknown>): void {
    const sessionID = typeof properties.sessionID === "string" ? properties.sessionID : undefined;
    if (!sessionID || !this.tracked.delete(sessionID)) {
      return;
    }
    this.notifyRemoved(sessionID);
  }

  protected isInside(directory: string): boolean {
    return this.roots.some((root) => directory === root || directory.startsWith(`${root}/`));
  }

  protected summary(tracked: Tracked): SessionSummary {
    return {
      id: tracked.raw.id,
      directory: tracked.raw.directory,
      title: tracked.raw.title,
      status: computeStatus(tracked.facts),
      model: tracked.raw.model.id,
      messageCount: tracked.messageCount,
      updatedAt: tracked.raw.time.updated,
    };
  }

  protected notifyChanged(summary: SessionSummary): void {
    this.client?.onSessionChanged(summary);
  }

  protected notifyRemoved(id: string): void {
    this.client?.onSessionRemoved(id);
  }

  protected notifyReloadRequested(): void {
    this.client?.onReloadRequested();
  }
}
