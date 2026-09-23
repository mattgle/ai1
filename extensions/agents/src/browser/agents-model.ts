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
import { OncePerKey } from "../common/once-per-key";
import { groupSessions } from "../common/session-groups";

// The front-end copy of the sessions. The back end pushes one card per
// change; the model regroups and tells the widget.
@injectable()
export class AgentsModel implements AgentsClient {
  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  protected readonly sessions = new Map<string, SessionSummary>();
  protected readonly lastMessages = new Map<string, string>();
  protected readonly lastMessageOnce = new OncePerKey();
  protected readonly onDidChangeEmitter = new Emitter<void>();
  readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
  readonly onDidChangeStatusEmitter = new Emitter<{
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
  protected loading: Promise<void> | undefined;
  protected loadedOnce = false;

  get groups(): SessionGroup[] {
    return groupSessions([...this.sessions.values()]);
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

  // Two overlapping calls (for example the widget's own first load racing
  // the first `onConnectionChanged(true)`) collapse into the one in-flight
  // request, so a stale response cannot overwrite a newer one.
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.doLoad().finally(() => {
        this.loading = undefined;
      });
    }
    return this.loading;
  }

  protected async doLoad(): Promise<void> {
    const roots = await this.workspace.roots;
    let snapshot: AgentsSnapshot;
    try {
      snapshot = await this.service.load(roots.map((root) => root.resource.toString()));
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.onDidChangeEmitter.fire();
      return;
    }
    this.sessions.clear();
    for (const group of snapshot.groups) {
      for (const session of group.sessions) {
        this.sessions.set(session.id, session);
      }
    }
    this.connected = snapshot.connected;
    this.loadedOnce = true;
    this.onDidChangeEmitter.fire();
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  // A card asks for its last message on every re-render. `lastMessageOnce`
  // guards the RPC call so a card in flight, or already answered, does not
  // send it again.
  async ensureLastMessage(id: string): Promise<void> {
    if (this.lastMessages.has(id)) {
      return;
    }
    this.lastMessageOnce.run(id, async () => {
      // A failed request rejects, so `lastMessageOnce` lets a later
      // re-render try again.
      const text = await this.service.lastMessage(id);
      if (text !== undefined) {
        this.lastMessages.set(id, text);
        this.onDidChangeEmitter.fire();
      }
    });
  }

  onSessionChanged(summary: SessionSummary): void {
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
    // during the cut). The reentrancy guard in `load()` would also collapse
    // a duplicate first-connect load into the widget's own call, but
    // skipping it here avoids starting it at all.
    if (connected && !wasConnected && this.loadedOnce) {
      void this.load();
    }
    this.onDidChangeEmitter.fire();
  }
}
