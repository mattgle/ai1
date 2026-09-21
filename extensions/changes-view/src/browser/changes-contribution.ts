import { Command, CommandRegistry } from "@theia/core";
import {
  AbstractViewContribution,
  codicon,
  FrontendApplicationContribution,
  Widget,
} from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesWidget } from "./changes-widget";

export const ChangesCommands = {
  REFRESH: { id: "ai1.changes.refresh", label: "Changes: Refresh", iconClass: codicon("refresh") },
  EXPAND_ALL: { id: "ai1.changes.expandAll", label: "Changes: Expand All", iconClass: codicon("expand-all") },
  COLLAPSE_ALL: {
    id: "ai1.changes.collapseAll",
    label: "Changes: Collapse All",
    iconClass: codicon("collapse-all"),
  },
} satisfies Record<string, Command>;

@injectable()
export class ChangesContribution
  extends AbstractViewContribution<ChangesWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  constructor() {
    super({
      widgetId: ChangesWidget.ID,
      widgetName: ChangesWidget.LABEL,
      defaultWidgetOptions: { area: "right", rank: 100 },
      toggleCommandId: "ai1.changes.toggle",
    });
  }

  // Theia calls this only when no saved layout exists. So the view opens on
  // the right on the first start, and later manual changes stay.
  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: true });
  }

  override registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    const forChanges = (run: (widget: ChangesWidget) => void) => ({
      execute: (widget?: Widget) => this.withChangesWidget(widget, run),
      isEnabled: (widget?: Widget) => widget instanceof ChangesWidget,
      isVisible: (widget?: Widget) => widget instanceof ChangesWidget,
    });
    commands.registerCommand(
      ChangesCommands.REFRESH,
      forChanges((widget) => widget.scheduleRefresh(0)),
    );
    commands.registerCommand(
      ChangesCommands.EXPAND_ALL,
      forChanges((widget) => widget.expandAll()),
    );
    commands.registerCommand(
      ChangesCommands.COLLAPSE_ALL,
      forChanges((widget) => widget.collapseAll()),
    );
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    const items: [Command, string, number][] = [
      [ChangesCommands.REFRESH, "Refresh", 0],
      [ChangesCommands.EXPAND_ALL, "Expand All", 1],
      [ChangesCommands.COLLAPSE_ALL, "Collapse All", 2],
    ];
    for (const [command, tooltip, priority] of items) {
      toolbar.registerItem({ id: command.id, command: command.id, tooltip, priority });
    }
  }

  protected withChangesWidget(widget: Widget | undefined, run: (widget: ChangesWidget) => void): void {
    if (widget instanceof ChangesWidget) {
      run(widget);
    }
  }
}
