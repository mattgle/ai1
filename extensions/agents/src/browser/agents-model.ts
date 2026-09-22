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
  protected readonly onDidChangeEmitter = new Emitter<void>();
  readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
  readonly onDidChangeStatusEmitter = new Emitter<{
    session: SessionSummary;
    previous: SessionStatus | undefined;
  }>();
  readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;
  readonly openTerminals = new Set<string>();
  connected = false;
  error: string | undefined;

  get groups(): SessionGroup[] {
    return groupSessions([...this.sessions.values()]);
  }

  lastMessageOf(id: string): string | undefined {
    return this.lastMessages.get(id);
  }

  sessionsWithStatus(status: SessionStatus): SessionSummary[] {
    return [...this.sessions.values()].filter((session) => session.status === status);
  }

  async load(): Promise<void> {
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
    this.onDidChangeEmitter.fire();
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  async ensureLastMessage(id: string): Promise<void> {
    if (this.lastMessages.has(id)) {
      return;
    }
    const text = await this.service.lastMessage(id).catch(() => undefined);
    if (text !== undefined) {
      this.lastMessages.set(id, text);
      this.onDidChangeEmitter.fire();
    }
  }

  onSessionChanged(summary: SessionSummary): void {
    const previous = this.sessions.get(summary.id)?.status;
    this.sessions.set(summary.id, summary);
    if (previous !== summary.status) {
      this.onDidChangeStatusEmitter.fire({ session: summary, previous });
    }
    if (summary.status === "done" || summary.status === "failed") {
      this.lastMessages.delete(summary.id);
    }
    this.onDidChangeEmitter.fire();
  }

  onSessionRemoved(id: string): void {
    this.sessions.delete(id);
    this.lastMessages.delete(id);
    this.openTerminals.delete(id);
    this.onDidChangeEmitter.fire();
  }

  onConnectionChanged(connected: boolean): void {
    const wasConnected = this.connected;
    this.connected = connected;
    if (connected && !wasConnected) {
      // Events could be lost during the cut. A full load repairs the state.
      void this.load();
    }
    this.onDidChangeEmitter.fire();
  }
}
