import { Command, CommandRegistry, MessageService } from "@theia/core";
import { AbstractViewContribution, FrontendApplicationContribution } from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { AgentsModel } from "./agents-model";
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

  async onStart(): Promise<void> {
    const widget = await this.widget;
    widget.onOpenSession = (node) => this.openSessionTerminal(node);
    widget.onNewSession = (directory) => this.newSession(directory);
    widget.onDeleteSession = (node) => this.deleteSession(node);
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
    toolbar.registerItem({
      id: AgentsCommands.REFRESH.id,
      command: AgentsCommands.REFRESH.id,
      tooltip: "Refresh",
      priority: 0,
    });
    toolbar.registerItem({
      id: AgentsCommands.NEW_SESSION.id,
      command: AgentsCommands.NEW_SESSION.id,
      tooltip: "New session",
      icon: "codicon codicon-add",
      priority: 1,
    });
  }

  // Task 5 fills these five methods. Until then each one shows a message.
  protected openSessionTerminal(_node: SessionNode): void {
    this.messages.info("Session terminals come in the next task.");
  }

  protected newSession(_directory?: string): void {
    this.messages.info("New sessions come in the next task.");
  }

  protected deleteSession(_node: SessionNode): void {
    this.messages.info("Delete comes in the next task.");
  }

  protected pickAndOpen(): void {
    this.messages.info("Open Session comes in the next task.");
  }

  protected pickAndDelete(): void {
    this.messages.info("Delete Session comes in the next task.");
  }

  protected closeIdleTerminals(): void {
    this.messages.info("Close Idle Terminals comes in the next task.");
  }

  protected newPersistentTerminal(): void {
    this.messages.info("Persistent terminals come in the next task.");
  }
}
