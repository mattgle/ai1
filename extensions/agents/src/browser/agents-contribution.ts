import { Command, CommandRegistry, MessageService, QuickInputService, QuickPickService } from "@theia/core";
import { isOSX } from "@theia/core/lib/common";
import { MenuModelRegistry } from "@theia/core/lib/common/menu";
import {
  AbstractViewContribution,
  ApplicationShell,
  Badge,
  BadgeService,
  ConfirmDialog,
  SingleTextInputDialog,
  FrontendApplicationContribution,
  KeybindingRegistry,
  OnWillStopAction,
  Widget,
  WidgetManager,
} from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { FileDialogService } from "@theia/filesystem/lib/browser/file-dialog/file-dialog-service";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import { TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { AgentsService, SessionSummary } from "../common/agents-protocol";
import { sessionBadge } from "../common/badge-decoration";
import { AgentsModel } from "./agents-model";
import { AgentsTerminals } from "./agents-terminals";
import { isSessionNode, SessionNode } from "./agents-tree";
import { AgentsWidget, SESSION_CONTEXT_MENU } from "./agents-widget";
import { TerminalControls } from "./terminal-controls";

export const AgentsCommands = {
  NEW_SESSION: { id: "ai1.agents.newSession", label: "New Session", category: "Agents" },
  OPEN_SESSION: { id: "ai1.agents.openSession", label: "Open Session", category: "Agents" },
  DELETE_SESSION: { id: "ai1.agents.deleteSession", label: "Delete Session", category: "Agents" },
  RENAME_SESSION: { id: "ai1.agents.renameSession", label: "Rename Session", category: "Agents" },
  SELECT_PARENT: { id: "ai1.agents.selectParent", label: "Select Parent Session", category: "Agents" },
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
  SPLIT_TERMINAL_RIGHT: {
    id: "ai1.terminal.splitRight",
    label: "Split Terminal Right",
    category: "Terminal",
  },
  SPLIT_TERMINAL_DOWN: { id: "ai1.terminal.splitDown", label: "Split Terminal Down", category: "Terminal" },
  DELETE_TO_LINE_START: {
    id: "ai1.terminal.deleteToLineStart",
    label: "Delete to Line Start",
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

  @inject(TerminalControls)
  protected readonly terminalControls!: TerminalControls;

  @inject(QuickPickService)
  protected readonly quickPick!: QuickPickService;

  @inject(QuickInputService)
  protected readonly quickInput!: QuickInputService;

  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(FileService)
  protected readonly files!: FileService;

  @inject(FileDialogService)
  protected readonly fileDialogs!: FileDialogService;

  @inject(BadgeService)
  protected readonly badges!: BadgeService;

  @inject(WidgetManager)
  protected readonly widgetManager!: WidgetManager;

  // Tracks the last badge actually applied, per widget instance (see
  // `onStart`'s comment on why there can be more than one over the life of
  // the window), so a `AgentsModel.onDidChange` firing for an unrelated
  // reason (a terminal opened, a last message loaded, ...) does not
  // re-decorate the tab every time -- only an actual change in the blocked
  // count does.
  protected readonly lastBadge = new WeakMap<AgentsWidget, Badge | undefined>();

  // Tracked so a widget already wired (by `onStart`'s own direct check, or
  // by a previous `onDidCreateWidget` event) is not wired a second time.
  protected readonly wiredWidgets = new WeakSet<AgentsWidget>();

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
  //
  // Closing the Agents tab disposes its `AgentsWidget`; `WidgetManager`
  // then makes a brand new instance the next time the view opens (the
  // toggle command, its side-bar icon, or a click on it in the View menu),
  // which is a *different* object than the one this method wired the first
  // time. `WidgetManager.onDidCreateWidget` fires for every widget any
  // factory creates, for the life of the window, so subscribing to it here
  // wires each one -- the first and every one after a close and reopen.
  // `tryGetWidget()` also wires one that already exists by the time this
  // method runs (a restored layout can create it before `onStart` gets to
  // subscribe); `wireWidget` itself is guarded against wiring the same
  // instance twice, so no ordering between the two matters.
  async onStart(): Promise<void> {
    this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
      if (factoryId === AgentsWidget.ID) {
        this.wireWidget(widget as AgentsWidget);
      }
    });
    const existing = this.tryGetWidget();
    if (existing) {
      this.wireWidget(existing);
    }
    // The event stream and the blocked notice must work even while the
    // Agents view itself is closed (`BlockedNotifier` and the tab badge
    // both read `AgentsModel`, not the widget). `AgentsWidget.init()`
    // starts its own `load()` when the view is open, and `AgentsModel.load`'s
    // own gate (`loadGate`) joins this call with that one when both happen
    // to start close together, so this does not double the work. `load()`
    // already carries its own error handling for an ordinary RPC failure
    // (`doLoad`'s try/catch sets `this.error` and fires `onDidChange`), but
    // it can still throw on an unexpected bug in the loading pipeline (see
    // `runGatedOnce`); caught here so that cannot become an unhandled
    // rejection.
    this.agents.load().catch((error) => {
      console.error(`ai1-agents: the load failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  protected wireWidget(widget: AgentsWidget): void {
    if (this.wiredWidgets.has(widget)) {
      return;
    }
    this.wiredWidgets.add(widget);
    widget.onOpenSession = (node) => void this.openSessionTerminal(node);
    widget.onNewSession = (directory) => void this.newSession(directory);
    widget.onDeleteSession = (node) => void this.deleteSession(node.session);
    // The same path as the Refresh command: `refresh()` already carries the
    // command's own catch, which shows a message on a failure `load()`
    // itself throws instead of merely recording in `this.agents.error`.
    widget.onRetry = () => void this.refresh();
    const subscription = this.agents.onDidChange(() => this.applyBadge(widget));
    // Without this, the subscription above outlives its widget: it would
    // keep calling `applyBadge` on a disposed widget forever, and keep
    // that widget from being garbage-collected, for every close of the
    // view over the life of the window.
    widget.disposed.connect(() => subscription.dispose());
    this.applyBadge(widget);
  }

  // The badge with the blocked-session count on the Agents tab. Uses
  // Theia's own `BadgeService`/`TabBarBadgeDecorator`
  // (`@theia/core/src/browser/badges`, always bound by the core frontend
  // module): it already decorates a plain widget's tab from
  // `BadgeService.getBadge(widget)`, so the Agents tab needs no
  // `TabBarDecorator` of its own.
  protected applyBadge(widget: AgentsWidget): void {
    const badge = sessionBadge(this.agents.sessionsWithStatus("blocked").length);
    if (badge?.value === this.lastBadge.get(widget)?.value) {
      return;
    }
    this.lastBadge.set(widget, badge);
    this.badges.showBadge(widget, badge);
  }

  onDidInitializeLayout(): void {
    void this.terminals.reopenPersistent().catch((error) => {
      console.warn(
        `ai1-agents: could not reopen persistent terminals: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  // Closes the back-end process of every open transient session
  // tab before a reload or a close (see `AgentsTerminals.closeTransientSessionBackends`).
  // `action` always returns `true`: it never asks the user to confirm, it
  // only needs the time to run, and that time has a limit.
  //
  // With no tab open, there is no veto, so Theia's own exit confirmation
  // (`application.confirmExit`) works as usual. While a tab is open, Theia
  // shows no confirmation for "always": it adds its dialog only when there
  // is no other veto. With `confirmExit: "never"`, Theia skips every veto
  // and the processes stay until the back end stops.
  // The high priority runs this after every veto that can cancel the close.
  onWillStop(): OnWillStopAction | undefined {
    if (!this.terminals.hasTerminals()) {
      return undefined;
    }
    return {
      action: async () => {
        await this.terminals.closeTransientSessionBackends();
        return true;
      },
      reason: "AI1 agent terminals",
      priority: 1000,
    };
  }

  override registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    commands.registerCommand(
      { id: "ai1.agents.focus", label: "Agents: Focus" },
      {
        execute: () => this.openView({ activate: true }),
      },
    );
    commands.registerCommand(AgentsCommands.REFRESH, { execute: () => this.refresh() });
    commands.registerCommand(AgentsCommands.NEW_SESSION, { execute: () => this.newSession() });
    commands.registerCommand(AgentsCommands.OPEN_SESSION, {
      execute: (node?: SessionNode) =>
        isSessionNode(node) ? this.openSessionTerminal(node) : this.pickAndOpen(),
    });
    commands.registerCommand(AgentsCommands.DELETE_SESSION, {
      execute: (node?: SessionNode) =>
        isSessionNode(node) ? this.deleteSession(node.session) : this.pickAndDelete(),
    });
    commands.registerCommand(AgentsCommands.RENAME_SESSION, {
      isEnabled: (node?: SessionNode) => isSessionNode(node),
      isVisible: (node?: SessionNode) => isSessionNode(node),
      execute: (node?: SessionNode) => (isSessionNode(node) ? this.renameSession(node.session) : undefined),
    });
    commands.registerCommand(AgentsCommands.SELECT_PARENT, {
      isVisible: (node?: SessionNode) => isSessionNode(node) && !!node.session.parentId,
      isEnabled: (node?: SessionNode) =>
        isSessionNode(node) &&
        node.session.parentId !== node.session.id &&
        !!this.tryGetWidget()?.parentSession(node),
      execute: (node?: SessionNode) =>
        isSessionNode(node) ? this.tryGetWidget()?.selectParentSession(node) : undefined,
    });
    commands.registerCommand(AgentsCommands.CLOSE_IDLE_TERMINALS, {
      execute: () => this.closeIdleTerminals(),
    });
    commands.registerCommand(AgentsCommands.NEW_PERSISTENT_TERMINAL, {
      execute: (widget?: Widget) => this.newPersistentTerminal(widget),
    });
    commands.registerCommand(AgentsCommands.DELETE_TO_LINE_START, {
      isEnabled: () => this.shell.currentWidget instanceof TerminalWidget,
      execute: () => {
        const terminal = this.shell.currentWidget;
        if (terminal instanceof TerminalWidget) {
          terminal.sendText("\u0015");
        }
      },
    });
    for (const [command, mode] of [
      [AgentsCommands.SPLIT_TERMINAL_RIGHT, "split-right"],
      [AgentsCommands.SPLIT_TERMINAL_DOWN, "split-bottom"],
    ] as const) {
      commands.registerCommand(command, {
        isEnabled: () => this.shell.currentWidget instanceof TerminalWidget,
        execute: () => this.splitTerminal(mode),
      });
    }
  }

  override registerKeybindings(keybindings: KeybindingRegistry): void {
    super.registerKeybindings(keybindings);
    keybindings.registerKeybinding({
      command: "ai1.agents.focus",
      keybinding: isOSX ? "meta+ctrl+a" : "ctrl+shift+a",
    });
    keybindings.registerKeybinding({
      command: AgentsCommands.NEW_PERSISTENT_TERMINAL.id,
      keybinding: "ctrlcmd+t",
    });
    keybindings.registerKeybindings(
      {
        command: AgentsCommands.DELETE_TO_LINE_START.id,
        keybinding: "meta+backspace",
        when: "terminalFocus",
      },
      { command: AgentsCommands.SPLIT_TERMINAL_RIGHT.id, keybinding: "ctrlcmd+d", when: "terminalFocus" },
      {
        command: AgentsCommands.SPLIT_TERMINAL_DOWN.id,
        keybinding: "ctrlcmd+shift+d",
        when: "terminalFocus",
      },
    );
  }

  override registerMenus(menus: MenuModelRegistry): void {
    super.registerMenus(menus);
    menus.registerMenuAction([...SESSION_CONTEXT_MENU, "1-session"], {
      commandId: AgentsCommands.RENAME_SESSION.id,
      label: "Rename Session",
      order: "0",
    });
    menus.registerMenuAction([...SESSION_CONTEXT_MENU, "1-session"], {
      commandId: AgentsCommands.OPEN_SESSION.id,
      label: "Open Terminal",
      order: "1",
    });
    menus.registerMenuAction([...SESSION_CONTEXT_MENU, "2-delete"], {
      commandId: AgentsCommands.DELETE_SESSION.id,
      label: "Delete Session",
      order: "0",
    });
    menus.registerMenuAction([...SESSION_CONTEXT_MENU, "1-session"], {
      commandId: AgentsCommands.SELECT_PARENT.id,
      label: "Select Parent Session",
      order: "2",
    });
  }

  protected async renameSession(session: SessionSummary): Promise<void> {
    const title = await new SingleTextInputDialog({
      title: "Rename Session",
      initialValue: session.title,
      confirmButtonLabel: "Rename",
      validate: (value) => (value.trim() ? "" : "Enter a session name."),
    }).open();
    if (title === undefined || title.trim() === session.title) {
      return;
    }
    try {
      await this.service.renameSession(session.id, title.trim());
    } catch (error) {
      this.messages.error(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  // The Refresh command's own body: `load()` already surfaces an ordinary
  // RPC failure through `this.agents.error` (which the widget renders),
  // but it can still throw on an unexpected bug in the loading pipeline
  // (see `runGatedOnce`) -- caught here, the same way every other command
  // body in this class reports its own failure, so a click on Refresh
  // cannot leave an unhandled rejection behind.
  protected async refresh(): Promise<void> {
    try {
      await this.agents.load();
    } catch (error) {
      this.messages.error(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  protected async newPersistentTerminal(widget?: Widget): Promise<void> {
    this.terminalControls.restoreZoom();
    const ref =
      widget && this.shell.getAreaFor(widget) === "main" ? widget : this.shell.mainPanel.currentTitle?.owner;
    const placement: ApplicationShell.WidgetOptions = {
      area: "main",
      ref,
      mode: "tab-after",
    };
    const target = await this.pickTerminalDirectory();
    if (!target) {
      return;
    }
    try {
      await this.terminals.newPersistent(target, placement);
    } catch (error) {
      // The back end's own message already carries an install hint when it
      // applies (see `resolve-program.ts`); showing it as-is avoids saying
      // "brew install tmux" twice.
      this.messages.error(error instanceof Error ? error.message : String(error));
    }
  }

  protected async splitTerminal(mode: "split-right" | "split-bottom"): Promise<void> {
    this.terminalControls.restoreZoom();
    const ref = this.shell.currentWidget;
    if (!(ref instanceof TerminalWidget)) {
      return;
    }
    const placement: ApplicationShell.WidgetOptions = {
      ref,
      area: this.shell.getAreaFor(ref) || "main",
      mode,
    };
    try {
      const directory =
        this.terminals.directoryOf(ref) ??
        ref.lastCwd?.path.fsPath() ??
        this.workspace.tryGetRoots()[0]?.resource.path.fsPath();
      if (directory) {
        await this.terminals.newPersistent(directory, placement);
      }
    } catch (error) {
      this.messages.error(error instanceof Error ? error.message : String(error));
    }
  }

  protected async pickTerminalDirectory(): Promise<string | undefined> {
    const roots = await this.workspace.roots;
    const candidates: { label: string; description: string; path?: string }[] = [];
    const paths = new Set<string>();
    const add = (label: string, directory: string): void => {
      if (paths.has(directory)) return;
      paths.add(directory);
      candidates.push({ label, description: directory, path: directory });
    };
    for (const root of roots) {
      add(`./ · ${root.resource.path.base}`, root.resource.path.fsPath());
    }
    for (const root of roots) {
      const folder = await this.files.resolve(root.resource).catch(() => undefined);
      const children = (folder?.children ?? [])
        .filter((child) => child.isDirectory)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) add(child.name, child.resource.path.fsPath());
    }
    const browse = { label: "Browse…", description: "Select another folder", alwaysShow: true };
    candidates.push(browse);
    let revision = 0;
    let closed = false;
    const picked = await this.quickInput.showQuickPick(candidates, {
      placeholder: "New persistent terminal in",
      matchOnDescription: false,
      matchOnDetail: false,
      onDidHide: () => {
        closed = true;
        revision++;
      },
      onDidChangeValue: async (picker, value) => {
        const request = ++revision;
        const slash = value.lastIndexOf("/");
        if (slash < 0) {
          picker.items = candidates;
          picker.busy = false;
          picker.description = undefined;
          return;
        }
        const prefix = value.slice(0, slash + 1);
        picker.items = [];
        picker.busy = true;
        picker.description = "Browsing subfolders…";
        const folders = await Promise.all(
          roots.map(async (root) => {
            const resource = root.resource.resolve(prefix);
            return this.files.resolve(resource).catch(() => undefined);
          }),
        );
        if (closed || request !== revision) return;
        const items: typeof candidates = [];
        const seen = new Set<string>();
        for (const folder of folders) {
          if (!folder?.isDirectory) continue;
          const directory = folder.resource.path.fsPath();
          if (!seen.has(directory)) {
            seen.add(directory);
            items.push({ label: prefix, description: directory, path: directory });
          }
          const children = (folder.children ?? [])
            .filter((child) => child.isDirectory)
            .sort((a, b) => a.name.localeCompare(b.name));
          for (const child of children) {
            const childPath = child.resource.path.fsPath();
            if (seen.has(childPath)) continue;
            seen.add(childPath);
            items.push({ label: `${prefix}${child.name}`, description: childPath, path: childPath });
          }
        }
        picker.items = [...items, browse];
        picker.description = items.length ? undefined : "Folder not found. Edit the path or use Browse.";
        picker.busy = false;
      },
    });
    closed = true;
    revision++;
    if (!picked) return undefined;
    if (picked.path) return picked.path;
    const folder = roots[0] ? await this.files.resolve(roots[0].resource).catch(() => undefined) : undefined;
    const selected = await this.fileDialogs.showOpenDialog(
      {
        title: "New persistent terminal in",
        openLabel: "Open Terminal",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      },
      folder,
    );
    return selected?.path.fsPath();
  }

  // Agent creation keeps its existing Git repository choices.
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
