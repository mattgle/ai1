import {
  AbstractViewContribution,
  BadgeService,
  FrontendApplicationContribution,
} from "@theia/core/lib/browser";
import { ClipboardService } from "@theia/core/lib/browser/clipboard-service";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { WindowService } from "@theia/core/lib/browser/window/window-service";
import { Command, CommandRegistry, MenuModelRegistry } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { PortRow } from "../common/ports";
import { PortsScan } from "../common/ports-protocol";
import { portAddress, PORTS_ROW_MENU, PortsWidget } from "./ports-widget";

export const PortsCommands = {
  REFRESH: { id: "ai1.ports.refresh", label: "Ports: Refresh", iconClass: "codicon codicon-refresh" },
  OPEN_IN_SYSTEM_BROWSER: { id: "ai1.ports.openInSystemBrowser", label: "Open in System Browser" },
  COPY_ADDRESS: { id: "ai1.ports.copyAddress", label: "Copy Address" },
} satisfies Record<string, Command>;

@injectable()
export class PortsContribution
  extends AbstractViewContribution<PortsWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  @inject(BadgeService)
  protected readonly badges!: BadgeService;

  @inject(WindowService)
  protected readonly windowService!: WindowService;

  @inject(ClipboardService)
  protected readonly clipboard!: ClipboardService;

  constructor() {
    super({
      widgetId: PortsWidget.ID,
      widgetName: "Ports",
      defaultWidgetOptions: { area: "right", rank: 300 },
      toggleCommandId: "ai1.ports.toggle",
    });
  }

  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: false });
  }

  async onDidInitializeLayout(): Promise<void> {
    const widget = await this.widget;
    widget.onDidScan((scan) => this.updateBadge(widget, scan));
  }

  protected updateBadge(widget: PortsWidget, scan: PortsScan): void {
    const count = scan.ok ? scan.groups.reduce((sum, group) => sum + group.rows.length, 0) : 0;
    this.badges.showBadge(
      widget,
      count > 0 ? { value: count, tooltip: `${count} servers of the workspace` } : undefined,
    );
  }

  override registerCommands(registry: CommandRegistry): void {
    super.registerCommands(registry);
    registry.registerCommand(PortsCommands.REFRESH, {
      execute: async () => (await this.widget).refresh(),
    });
    registry.registerCommand(PortsCommands.OPEN_IN_SYSTEM_BROWSER, {
      execute: (row: PortRow) => this.windowService.openNewWindow(portAddress(row), { external: true }),
    });
    registry.registerCommand(PortsCommands.COPY_ADDRESS, {
      execute: (row: PortRow) => this.clipboard.writeText(portAddress(row)),
    });
  }

  override registerMenus(menus: MenuModelRegistry): void {
    super.registerMenus(menus);
    menus.registerMenuAction(PORTS_ROW_MENU, {
      commandId: PortsCommands.OPEN_IN_SYSTEM_BROWSER.id,
      order: "1",
    });
    menus.registerMenuAction(PORTS_ROW_MENU, { commandId: PortsCommands.COPY_ADDRESS.id, order: "2" });
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    toolbar.registerItem({
      id: PortsCommands.REFRESH.id,
      command: PortsCommands.REFRESH.id,
      tooltip: "Refresh",
      isVisible: (widget) => widget instanceof PortsWidget,
    });
  }
}
