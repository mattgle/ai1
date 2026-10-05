import {
  ApplicationShell,
  FrontendApplicationContribution,
  Widget,
  WidgetManager,
} from "@theia/core/lib/browser";
import { CommonCommands } from "@theia/core/lib/browser/common-frontend-contribution";
import { KeybindingRegistry } from "@theia/core/lib/browser/keybinding";
import { StatefulWidget } from "@theia/core/lib/browser/shell/shell-layout-restorer";
import { WidgetConstructionOptions } from "@theia/core/lib/browser/widget-manager";
import { CommandContribution, CommandRegistry } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DockPanel } from "@theia/core/shared/@lumino/widgets";

interface ClosedWidget {
  widget: Widget;
  construction?: WidgetConstructionOptions;
  state?: object;
}

interface ClosedBatch {
  entries: ClosedWidget[];
  layout: DockPanel.ILayoutConfig;
  activeId?: string;
}

type AreaConfig = NonNullable<DockPanel.ILayoutConfig["main"]>;

const REOPEN_BATCH = { id: "ai1.tabs.reopenClosedBatch", label: "Reopen Closed Tabs" };
const CLOSE_BATCH = { id: "ai1.tabs.closeAll", label: "Close All Tabs" };

@injectable()
export class ClosedTabBatchContribution implements CommandContribution, FrontendApplicationContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(WidgetManager)
  protected readonly widgets!: WidgetManager;

  @inject(KeybindingRegistry)
  protected readonly keybindings!: KeybindingRegistry;

  protected readonly batches: ClosedBatch[] = [];
  protected busy = false;
  protected closing?: Promise<void>;

  registerCommands(commands: CommandRegistry): void {
    const closeHandler = {
      isEnabled: () => !this.busy && this.shell.getWidgets("main").some((widget) => widget.title.closable),
      execute: () => {
        this.closing = this.closeBatch();
        return this.closing.finally(() => {
          this.closing = undefined;
        });
      },
    };
    commands.registerHandler(CommonCommands.CLOSE_ALL_MAIN_TABS.id, closeHandler);
    commands.registerCommand(CLOSE_BATCH, closeHandler);
    commands.registerCommand(REOPEN_BATCH, {
      isEnabled: () => this.closing !== undefined || (!this.busy && this.batches.length > 0),
      execute: async () => {
        await this.closing;
        return this.reopenBatch();
      },
    });
  }

  onStart(): void {
    const keybindings = this.keybindings;
    keybindings.registerKeybinding({
      command: "-terminal:clear",
      keybinding: "ctrlcmd+k",
      when: "terminalFocus",
    });
    keybindings.registerKeybinding({ command: CLOSE_BATCH.id, keybinding: "ctrlcmd+k ctrlcmd+w" });
    keybindings.registerKeybinding({
      command: CLOSE_BATCH.id,
      keybinding: "ctrlcmd+k ctrlcmd+w",
      when: "terminalFocus",
    });
    keybindings.registerKeybinding({ command: REOPEN_BATCH.id, keybinding: "ctrlcmd+shift+t" });
    keybindings.registerKeybinding({
      command: REOPEN_BATCH.id,
      keybinding: "ctrlcmd+shift+t",
      when: "terminalFocus",
    });
    keybindings.registerKeybinding({
      command: REOPEN_BATCH.id,
      keybinding: "ctrlcmd+shift+t",
      when: "editorTextFocus",
    });
  }

  protected async closeBatch(): Promise<void> {
    this.busy = true;
    try {
      const entries = this.shell
        .getWidgets("main")
        .filter((widget) => widget.title.closable)
        .map((widget) => ({
          widget,
          construction: this.widgets.getDescription(widget),
          state: StatefulWidget.is(widget) ? widget.storeState() : undefined,
        }));
      const layout = this.shell.mainPanel.saveLayout();
      const activeId = this.shell.mainPanel.currentTitle?.owner.id;
      const closed = await this.shell.closeMany(entries.map((entry) => entry.widget));
      const batch = entries.filter((entry) => closed.includes(entry.widget));
      if (batch.length) {
        this.batches.push({ entries: batch, layout, activeId });
        if (this.batches.length > 20) this.batches.shift();
      }
    } finally {
      this.busy = false;
    }
  }

  protected async reopenBatch(): Promise<void> {
    if (this.busy) return;
    const batch = this.batches[this.batches.length - 1];
    if (!batch) return;
    this.busy = true;
    try {
      const replacements = new Map<Widget, Widget>();
      for (const entry of batch.entries) {
        const widget =
          entry.widget.isDisposed && entry.construction
            ? await this.widgets.getOrCreateWidget(entry.construction.factoryId, entry.construction.options)
            : entry.widget;
        if (widget.isDisposed) continue;
        if (widget !== entry.widget && entry.state && StatefulWidget.is(widget))
          widget.restoreState(entry.state);
        this.shell.addWidget(widget, { area: "main" });
        replacements.set(entry.widget, widget);
      }
      const replace = (area: AreaConfig): AreaConfig =>
        area.type === "tab-area"
          ? {
              ...area,
              widgets: area.widgets
                .map((widget) => replacements.get(widget) ?? widget)
                .filter((widget) => !widget.isDisposed && this.shell.getAreaFor(widget) === "main"),
            }
          : { ...area, children: area.children.map(replace) };
      const restored = batch.layout.main ? replace(batch.layout.main) : null;
      const oldIds = new Set<string>();
      const collect = (area: AreaConfig): void => {
        if (area.type === "tab-area") area.widgets.forEach((widget) => oldIds.add(widget.id));
        else area.children.forEach(collect);
      };
      if (restored) collect(restored);
      const hasNewTabs = this.shell.getWidgets("main").some((widget) => !oldIds.has(widget.id));
      if (restored && !hasNewTabs) this.shell.mainPanel.restoreLayout({ main: restored });
      this.batches.pop();
      const active = this.shell.getWidgets("main").find((widget) => widget.id === batch.activeId);
      if (active) void this.shell.activateWidget(active.id);
    } finally {
      this.busy = false;
    }
  }
}
