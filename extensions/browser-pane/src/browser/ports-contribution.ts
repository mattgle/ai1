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
import { Command, CommandRegistry, MenuModelRegistry, MessageService } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { PortRow } from "../common/ports";
import { PortsScan } from "../common/ports-protocol";
import { portAddress, PORTS_ROW_MENU, PortsWidget } from "./ports-widget";

export const PortsCommands = {
  REFRESH: { id: "ai1.ports.refresh", label: "Ports: Refresh", iconClass: "codicon codicon-refresh" },
  OPEN_IN_SYSTEM_BROWSER: { id: "ai1.ports.openInSystemBrowser", label: "Open in System Browser" },
  COPY_ADDRESS: { id: "ai1.ports.copyAddress", label: "Copy Address" },
  STOP_SERVER: { id: "ai1.ports.stopServer", label: "Stop Server…" },
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

  @inject(MessageService)
  protected readonly messages!: MessageService;

  protected readonly wiredWidgets = new WeakSet<PortsWidget>();

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

  // Closing the Ports tab disposes its widget, and the next open makes a new
  // one. `onDidCreateWidget` wires the badge of each new widget.
  // `tryGetWidget` wires a widget that exists before this subscription.
  onStart(): void {
    this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
      if (factoryId === PortsWidget.ID) {
        this.wireWidget(widget as PortsWidget);
      }
    });
    const existing = this.tryGetWidget();
    if (existing) {
      this.wireWidget(existing);
    }
  }

  protected wireWidget(widget: PortsWidget): void {
    if (this.wiredWidgets.has(widget)) {
      return;
    }
    this.wiredWidgets.add(widget);
    widget.onDidScan((scan) => this.updateBadge(widget, scan));
  }

  // The Ports view opens hidden, behind the Changes and Agents views (see
  // `initializeLayout`), and its own 5-second scan only runs while it is
  // visible (`PortsWidget.onAfterShow`/`onAfterHide`). Without a scan here,
  // the tab badge would stay unset until the owner clicks the Ports tab once.
  // One scan here sets it correctly at start, and does not start the
  // 5-second interval (that stays tied to visibility, in the widget itself).
  async onDidInitializeLayout(): Promise<void> {
    const widget = await this.widget;
    this.wireWidget(widget);
    try {
      await widget.refresh();
    } catch (error) {
      console.error(
        `ai1-ports: the first scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    registry.registerCommand(PortsCommands.STOP_SERVER, {
      isVisible: (_row: PortRow, inWorkspaceGroup?: boolean) => inWorkspaceGroup === true,
      execute: async (row: PortRow) => {
        const answer = await this.messages.warn(
          `Stop ${row.program} on port ${row.port} (process ${row.pid})?`,
          "Stop Server",
        );
        if (answer !== "Stop Server") {
          return;
        }
        const result = await (await this.widget).stopServer(row);
        if (!result.ok) {
          await this.messages.error(result.error);
        }
      },
    });
  }

  override registerMenus(menus: MenuModelRegistry): void {
    super.registerMenus(menus);
    menus.registerMenuAction(PORTS_ROW_MENU, {
      commandId: PortsCommands.OPEN_IN_SYSTEM_BROWSER.id,
      order: "1",
    });
    menus.registerMenuAction(PORTS_ROW_MENU, { commandId: PortsCommands.COPY_ADDRESS.id, order: "2" });
    menus.registerMenuAction(PORTS_ROW_MENU, { commandId: PortsCommands.STOP_SERVER.id, order: "3" });
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
