import { Command, CommandRegistry, MessageService, QuickPickService } from "@theia/core";
import {
  AbstractViewContribution,
  ConfirmDialog,
  FrontendApplicationContribution,
  OnWillStopAction,
  Widget,
} from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import { AgentsService, SessionSummary } from "../common/agents-protocol";
import { AgentsModel } from "./agents-model";
import { AgentsTerminals } from "./agents-terminals";
import { SessionNode } from "./agents-tree";
import { AgentsWidget } from "./agents-widget";

export const AgentsCommands = {
  NEW_SESSION: { id: "ai1.agents.newSession", label: "New Session", category: "Agents" },
  OPEN_SESSION: { id: "ai1.agents.openSession", label: "Open Session", category: "Agents" },
  DELETE_SESSION: { id: "ai1.agents.deleteSession", label: "Delete Session", category: "Agents" },
  CLOSE_IDLE_TERMINALS: {
    id: "ai1.agents.closeIdleTerminals",
    label: "Close Idle Terminals",
    category: "Agents",
  },
  REFRESH: {
    id: "ai1.agents.refresh",
    label: "Refresh",
    category: "Agents",
    iconClass: "codicon codicon-refresh",
  },
  NEW_PERSISTENT_TERMINAL: {
    id: "ai1.terminal.newPersistent",
    label: "New Persistent Terminal",
    category: "Terminal",
  },
} satisfies Record<string, Command>;

@injectable()
export class AgentsContribution
  extends AbstractViewContribution<AgentsWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  @inject(AgentsModel)
  protected readonly agents!: AgentsModel;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(AgentsTerminals)
  protected readonly terminals!: AgentsTerminals;

  @inject(QuickPickService)
  protected readonly quickPick!: QuickPickService;

  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(FileService)
  protected readonly files!: FileService;

  constructor() {
    super({
      widgetId: AgentsWidget.ID,
      widgetName: AgentsWidget.LABEL,
      defaultWidgetOptions: { area: "right", rank: 200 },
      toggleCommandId: "ai1.agents.toggle",
    });
  }

  // The view opens itself on the first start, next to the Changes view.
  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: false });
  }

  // A tab added directly to the shell during `onStart` is not lost --
  // Lumino accepts a widget before the shell is attached to the DOM -- but
  // the layout restore that runs afterward (`initializeLayout()`, which
  // either restores the stored layout or builds the default one) rebuilds
  // the dock panels from scratch and unparents it again. `onDidInitializeLayout`
  // runs once that rebuild is settled, so a tab added there stays.
  async onStart(): Promise<void> {
    const widget = await this.widget;
    widget.onOpenSession = (node) => void this.openSessionTerminal(node);
    widget.onNewSession = (directory) => void this.newSession(directory);
    widget.onDeleteSession = (node) => void this.deleteSession(node.session);
  }

  onDidInitializeLayout(): void {
    void this.terminals.reopenPersistent().catch((error) => {
      console.warn(
        `ai1-agents: could not reopen persistent terminals: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  // The reliable place to close the back-end process of every open session
  // and persistent-shell tab: `isSafeToShutDown()` awaits this `action`
  // before a reload or a window close proceeds. See the long comment on
  // `AgentsTerminals.closeAllBackends` for why `onStop` (below) cannot do
  // this reliably by itself. `action` always returns `true`: this never
  // asks the user to confirm anything, it only needs the time to run.
  onWillStop(): OnWillStopAction {
    return {
      action: async () => {
        await this.terminals.closeAllBackends();
        return true;
      },
      reason: "AI1 agent terminals",
    };
  }

  // A best-effort companion to `onWillStop`, for a path that does not go
  // through it (see `AgentsTerminals.disposeAll`).
  onStop(): void {
    this.terminals.disposeAll();
  }

  override registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    commands.registerCommand(AgentsCommands.REFRESH, { execute: () => this.agents.load() });
    commands.registerCommand(AgentsCommands.NEW_SESSION, { execute: () => this.newSession() });
    commands.registerCommand(AgentsCommands.OPEN_SESSION, { execute: () => this.pickAndOpen() });
    commands.registerCommand(AgentsCommands.DELETE_SESSION, { execute: () => this.pickAndDelete() });
    commands.registerCommand(AgentsCommands.CLOSE_IDLE_TERMINALS, {
      execute: () => this.closeIdleTerminals(),
    });
    commands.registerCommand(AgentsCommands.NEW_PERSISTENT_TERMINAL, {
      execute: () => this.newPersistentTerminal(),
    });
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    // Without a scope, a toolbar item shows on every widget's toolbar, not
    // only the Agents view's. The command itself stays unscoped, so it is
    // still reachable from the command palette on any widget.
    const isAgentsWidget = (widget?: Widget): boolean => widget instanceof AgentsWidget;
    toolbar.registerItem({
      id: AgentsCommands.REFRESH.id,
      command: AgentsCommands.REFRESH.id,
      tooltip: "Refresh",
      priority: 0,
      isVisible: isAgentsWidget,
    });
    toolbar.registerItem({
      id: AgentsCommands.NEW_SESSION.id,
      command: AgentsCommands.NEW_SESSION.id,
      tooltip: "New session",
      icon: "codicon codicon-add",
      priority: 1,
      isVisible: isAgentsWidget,
    });
  }

  protected async openSessionTerminal(node: SessionNode): Promise<void> {
    try {
      await this.terminals.openSession(node.session);
    } catch (error) {
      this.messages.error(`Open session failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async newSession(directory?: string): Promise<void> {
    const target = directory ?? (await this.pickRepository("New session in"));
    if (!target) {
      return;
    }
    try {
      const created = await this.service.createSession(target);
      await this.terminals.openSession(created);
    } catch (error) {
      this.messages.error(`New session failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async deleteSession(session: SessionSummary): Promise<void> {
    const confirmed = await new ConfirmDialog({
      title: "Delete session",
      msg: `Delete the session '${session.title}'? You cannot undo this.`,
      ok: "Delete",
    }).open();
    if (!confirmed) {
      return;
    }
    try {
      await this.service.deleteSession(session.id);
      this.terminals.closeSession(session.id);
    } catch (error) {
      this.messages.error(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async pickAndOpen(): Promise<void> {
    const session = await this.pickSession("Open session");
    if (!session) {
      return;
    }
    try {
      await this.terminals.openSession(session);
    } catch (error) {
      this.messages.error(`Open session failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async pickAndDelete(): Promise<void> {
    const session = await this.pickSession("Delete session");
    if (session) {
      await this.deleteSession(session);
    }
  }

  protected closeIdleTerminals(): void {
    const closed = this.terminals.closeIdle();
    this.messages.info(`Closed ${closed} idle terminal${closed === 1 ? "" : "s"}.`);
  }

  protected async newPersistentTerminal(): Promise<void> {
    const target = await this.pickRepository("New persistent terminal in");
    if (!target) {
      return;
    }
    try {
      await this.terminals.newPersistent(target);
    } catch (error) {
      // The back end's own message already carries an install hint when it
      // applies (see `resolve-program.ts`); showing it as-is avoids saying
      // "brew install tmux" twice.
      this.messages.error(error instanceof Error ? error.message : String(error));
    }
  }

  // The workspace roots and their direct child folders that hold a .git folder.
  protected async pickRepository(placeholder: string): Promise<string | undefined> {
    const roots = await this.workspace.roots;
    const candidates: { label: string; description: string; path: string }[] = [];
    for (const root of roots) {
      const rootPath = root.resource.path.fsPath();
      if (await this.files.exists(root.resource.resolve(".git"))) {
        candidates.push({ label: root.resource.path.base, description: rootPath, path: rootPath });
      }
      const children = await this.files.resolve(root.resource).catch(() => undefined);
      for (const child of children?.children ?? []) {
        if (child.isDirectory && (await this.files.exists(child.resource.resolve(".git")))) {
          candidates.push({
            label: child.name,
            description: child.resource.path.fsPath(),
            path: child.resource.path.fsPath(),
          });
        }
      }
    }
    if (candidates.length === 0) {
      this.messages.info("No repository in this workspace.");
      return undefined;
    }
    const picked = await this.quickPick.show(candidates, { placeholder });
    return picked?.path;
  }

  protected async pickSession(placeholder: string): Promise<SessionSummary | undefined> {
    if (!this.agents.loaded) {
      await this.agents.load();
    }
    if (this.agents.error) {
      this.messages.error(this.agents.error);
      return undefined;
    }
    const items = this.agents.groups.flatMap((group) =>
      group.sessions.map((session) => ({
        label: session.title,
        description: `${group.name} · ${session.status}`,
        session,
      })),
    );
    const picked = await this.quickPick.show(items, { placeholder });
    return picked?.session;
  }
}
