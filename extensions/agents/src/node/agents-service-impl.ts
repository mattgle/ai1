import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { AgentsClient, AgentsService, AgentsSnapshot, SessionSummary } from "../common/agents-protocol";
import { mapLimit } from "../common/concurrency-limit";
import { groupSessions } from "../common/session-groups";
import { applyEvent, computeStatus, SessionFacts } from "../common/session-status";
import { TmuxSession } from "../common/tmux-list";
import { discoverConnection, ensureService, OpenCodeClient, RawSession } from "./opencode-client";
import { resolveProgram } from "./resolve-program";
import { listTmuxSessions, tmuxNewCommand } from "./tmux-runner";

interface Tracked {
  raw: RawSession;
  facts: SessionFacts;
  messageCount: number;
}

// How many `pendingPermissionSessionIds` calls (one per distinct session
// directory) run at once during a load, so a workspace with many
// repositories does not fire one HTTP request per repository all at once.
const PERMISSION_CHECK_CONCURRENCY = 4;

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
  protected resolvePath: (name: "opencode" | "tmux") => string = resolveProgram;

  init(
    connect: () => Promise<OpenCodeClient>,
    retry: { retryMs?: number } = {},
    resolvePath: (name: "opencode" | "tmux") => string = resolveProgram,
  ): void {
    this.connect = connect;
    this.retry = retry;
    this.resolvePath = resolvePath;
  }

  setClient(client: AgentsClient | undefined): void {
    this.client = client;
  }

  dispose(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
  }

  async load(workspaceRootUris: string[]): Promise<AgentsSnapshot> {
    this.roots = workspaceRootUris.map((uri) => normalizeRoot(fileURLToPath(uri)));
    const api = await this.apiClient();
    const [sessions, active] = await Promise.all([api.listSessions(), api.activeIds()]);
    // The pending-permission list is scoped by a directory that must equal
    // a session's own directory exactly (no prefix match against an
    // ancestor such as a workspace root, verified live in the Task 6 fix
    // round), so it is called once per distinct directory of the sessions
    // this workspace shows, not once per workspace root and not once per
    // session -- fewer calls than per-session in the common case, where
    // several sessions of one repository share one directory.
    const insideDirectories = new Set(
      sessions.filter((raw) => this.isInside(raw.directory)).map((raw) => raw.directory),
    );
    // A directory the OpenCode service does not have on disk any more (a
    // deleted repository, still in a session's stored directory) gives an
    // HTTP 500 for this call. One bad directory must not fail the whole
    // load: its own set is empty, with a warning, and every other
    // directory's answer still counts.
    const pendingSets = await mapLimit([...insideDirectories], PERMISSION_CHECK_CONCURRENCY, (directory) =>
      api.pendingPermissionSessionIds(directory).catch((error) => {
        console.warn(
          `ai1-agents: could not read the pending permissions of '${directory}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return new Set<string>();
      }),
    );
    const pending = new Set(pendingSets.flatMap((set) => [...set]));
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
    return { program: this.resolvePath("opencode"), args: ["--session", id, directory] };
  }

  async tmuxCommand(name: string, directory?: string): Promise<{ program: string; args: string[] }> {
    const command = tmuxNewCommand(name, directory);
    return { ...command, program: this.resolvePath("tmux") };
  }

  tmuxSessions(): Promise<TmuxSession[]> {
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
