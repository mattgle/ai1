import { fileURLToPath } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { AgentsClient, AgentsService, AgentsSnapshot, SessionSummary } from "../common/agents-protocol";
import { groupSessions } from "../common/session-groups";
import { applyEvent, computeStatus, SessionFacts } from "../common/session-status";
import { discoverConnection, ensureService, OpenCodeClient, RawSession } from "./opencode-client";
import { listTmuxSessions, tmuxNewCommand } from "./tmux-runner";

interface Tracked {
  raw: RawSession;
  facts: SessionFacts;
  messageCount: number;
}

// Connects to the OpenCode service on the first use. If the service does not
// run, starts it one time and waits up to 10 seconds.
async function connectWithStart(): Promise<OpenCodeClient> {
  try {
    return new OpenCodeClient(await discoverConnection());
  } catch (error) {
    if (!/does not run/.test(String(error))) {
      throw error;
    }
  }
  await ensureService();
  const deadline = Date.now() + 10_000;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      return new OpenCodeClient(await discoverConnection());
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last;
}

// Inversify calls this constructor with no arguments; it rejects a
// constructor with parameters that carry no @inject annotation. The
// connection factory and the retry options are set through `init`, which
// the tests call and the production module leaves at their defaults.
@injectable()
export class AgentsServiceImpl implements AgentsService {
  protected client: AgentsClient | undefined;
  protected api: OpenCodeClient | undefined;
  protected subscription: { dispose(): void } | undefined;
  protected readonly tracked = new Map<string, Tracked>();
  protected roots: string[] = [];
  protected connect: () => Promise<OpenCodeClient> = connectWithStart;
  protected retry: { retryMs?: number } = {};

  init(connect: () => Promise<OpenCodeClient>, retry: { retryMs?: number } = {}): void {
    this.connect = connect;
    this.retry = retry;
  }

  setClient(client: AgentsClient | undefined): void {
    this.client = client;
  }

  dispose(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
  }

  async load(workspaceRootUris: string[]): Promise<AgentsSnapshot> {
    this.roots = workspaceRootUris.map((uri) => fileURLToPath(uri));
    const api = await this.apiClient();
    const [sessions, active, pending] = await Promise.all([
      api.listSessions(),
      api.activeIds(),
      api.pendingPermissionSessionIds(),
    ]);
    this.tracked.clear();
    for (const raw of sessions) {
      this.tracked.set(raw.id, {
        raw,
        facts: {
          active: active.has(raw.id),
          running: false,
          pendingPermission: pending.has(raw.id),
          outcome: raw.outcome,
        },
        messageCount: 0,
      });
    }
    // The counts, in parallel, for the sessions inside the workspace only.
    const inside = [...this.tracked.values()].filter((t) => this.isInside(t.raw.directory));
    await Promise.all(
      inside.map(async (t) => {
        t.messageCount = await api.messageCount(t.raw.id).catch(() => 0);
      }),
    );
    this.ensureSubscribed(api);
    return {
      groups: groupSessions(
        inside.map((t) => this.summary(t)),
        this.roots,
      ),
      connected: this.subscription !== undefined,
    };
  }

  async lastMessage(id: string): Promise<string | undefined> {
    return (await this.apiClient()).lastMessageText(id);
  }

  async createSession(directory: string, title?: string): Promise<SessionSummary> {
    const api = await this.apiClient();
    const raw = await api.createSession(title, directory);
    const tracked: Tracked = {
      raw: { ...raw, directory: raw.directory || directory },
      facts: { active: false, running: false, pendingPermission: false, outcome: undefined },
      messageCount: 0,
    };
    this.tracked.set(raw.id, tracked);
    const summary = this.summary(tracked);
    this.client?.onSessionChanged(summary);
    return summary;
  }

  async deleteSession(id: string): Promise<void> {
    await (await this.apiClient()).deleteSession(id);
    this.tracked.delete(id);
    this.client?.onSessionRemoved(id);
  }

  async sessionCommand(id: string, directory: string): Promise<{ program: string; args: string[] }> {
    return { program: "opencode", args: ["--session", id, directory] };
  }

  async tmuxCommand(name: string, directory: string): Promise<{ program: string; args: string[] }> {
    return tmuxNewCommand(name, directory);
  }

  tmuxSessions(): Promise<string[]> {
    return listTmuxSessions();
  }

  protected async apiClient(): Promise<OpenCodeClient> {
    if (!this.api) {
      this.api = await this.connect();
    }
    return this.api;
  }

  protected ensureSubscribed(api: OpenCodeClient): void {
    if (this.subscription) {
      return;
    }
    this.subscription = api.subscribe(
      (type, properties) => this.onEvent(type, properties),
      (connected) => this.client?.onConnectionChanged(connected),
      this.retry,
    );
  }

  // The event names and the sessionID field are verified in this task.
  protected onEvent(type: string, properties: Record<string, unknown>): void {
    const id = typeof properties.sessionID === "string" ? properties.sessionID : undefined;
    if (!id) {
      return;
    }
    const tracked = this.tracked.get(id);
    if (!tracked) {
      return;
    }
    const before = computeStatus(tracked.facts);
    tracked.facts = applyEvent(tracked.facts, type);
    if (type === "session.step.ended") {
      tracked.messageCount += 1;
    }
    tracked.raw.time.updated = Date.now();
    const after = computeStatus(tracked.facts);
    if (before !== after || type === "session.step.ended" || type === "session.usage.updated") {
      this.client?.onSessionChanged(this.summary(tracked));
    }
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
}
