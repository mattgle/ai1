import {
  AbstractViewContribution,
  BadgeService,
  FrontendApplicationContribution,
} from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { Command, CommandRegistry, MenuModelRegistry, MessageService } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DownloadDone, downloadDoneText, DownloadEntry } from "../common/downloads";
import { browserApi } from "./browser-api";
import { DOWNLOADS_ROW_MENU, DownloadsWidget } from "./downloads-widget";

const SHOW_IN_FINDER = "Show in Finder";

export const DownloadsCommands = {
  CLEAR: {
    id: "ai1.downloads.clear",
    label: "Downloads: Clear List",
    iconClass: "codicon codicon-clear-all",
  },
  REMOVE: { id: "ai1.downloads.remove", label: "Remove from List" },
} satisfies Record<string, Command>;

@injectable()
export class DownloadsContribution
  extends AbstractViewContribution<DownloadsWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  @inject(BadgeService)
  protected readonly badges!: BadgeService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  protected readonly wiredWidgets = new WeakSet<DownloadsWidget>();

  constructor() {
    super({
      widgetId: DownloadsWidget.ID,
      widgetName: "Downloads",
      defaultWidgetOptions: { area: "right", rank: 310 },
      toggleCommandId: "ai1.downloads.toggle",
    });
  }

  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: false });
  }

  // Closing the Downloads tab disposes its widget, and the next open makes a
  // new one. `onDidCreateWidget` wires the badge of each new widget.
  // `tryGetWidget` wires a widget that exists before this subscription.
  onStart(): void {
    this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
      if (factoryId === DownloadsWidget.ID) {
        this.wireWidget(widget as DownloadsWidget);
      }
    });
    const existing = this.tryGetWidget();
    if (existing) {
      this.wireWidget(existing);
    }
    browserApi().onDownloadDone((done) => void this.notifyDone(done));
  }

  protected wireWidget(widget: DownloadsWidget): void {
    if (this.wiredWidgets.has(widget)) {
      return;
    }
    this.wiredWidgets.add(widget);
    widget.onDidChange((entries) => this.updateBadge(widget, entries));
  }

  // The Downloads view opens hidden. One read here sets the badge at start,
  // before the owner opens the view.
  async onDidInitializeLayout(): Promise<void> {
    const widget = await this.widget;
    this.wireWidget(widget);
    try {
      await widget.refresh();
    } catch (error) {
      console.error(
        `ai1-downloads: the first read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected updateBadge(widget: DownloadsWidget, entries: DownloadEntry[]): void {
    const count = entries.filter((entry) => entry.state === "progressing").length;
    this.badges.showBadge(
      widget,
      count > 0 ? { value: count, tooltip: `${count} downloads in progress` } : undefined,
    );
  }

  protected async notifyDone(done: DownloadDone): Promise<void> {
    if (done.state !== "completed") {
      await this.messages.info(downloadDoneText(done));
      return;
    }
    const answer = await this.messages.info(downloadDoneText(done), SHOW_IN_FINDER);
    if (answer === SHOW_IN_FINDER) {
      const error = await browserApi().showDownload(done.id);
      if (error) {
        await this.messages.error(error);
      }
    }
  }

  override registerCommands(registry: CommandRegistry): void {
    super.registerCommands(registry);
    registry.registerCommand(DownloadsCommands.CLEAR, {
      execute: () => browserApi().clearDownloads(),
    });
    registry.registerCommand(DownloadsCommands.REMOVE, {
      isEnabled: (entry?: DownloadEntry) => entry !== undefined && entry.state !== "progressing",
      execute: (entry: DownloadEntry) => browserApi().removeDownload(entry.id),
    });
  }

  override registerMenus(menus: MenuModelRegistry): void {
    super.registerMenus(menus);
    menus.registerMenuAction(DOWNLOADS_ROW_MENU, { commandId: DownloadsCommands.REMOVE.id, order: "1" });
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    toolbar.registerItem({
      id: DownloadsCommands.CLEAR.id,
      command: DownloadsCommands.CLEAR.id,
      tooltip: "Clear List",
      isVisible: (widget) => widget instanceof DownloadsWidget,
    });
  }
}
