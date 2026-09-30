import {
  ApplicationShell,
  FrontendApplicationContribution,
  KeybindingContribution,
  KeybindingRegistry,
  Widget,
} from "@theia/core/lib/browser";
import { CommandContribution, CommandRegistry } from "@theia/core/lib/common";
import { Disposable } from "@theia/core/lib/common/disposable";
import { FrontendApplicationStateService } from "@theia/core/lib/browser/frontend-application-state";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DockLayout, DockPanel } from "@theia/core/shared/@lumino/widgets";
import { TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { TerminalService } from "@theia/terminal/lib/browser/base/terminal-service";

type Direction = "left" | "right" | "up" | "down";
const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];
const EDITING = [
  ["wordLeft", "alt+left", "\u001bb"],
  ["wordRight", "alt+right", "\u001bf"],
  ["deleteWord", "alt+backspace", "\u001b\u007f"],
  ["lineStart", "meta+left", "\u0001"],
  ["lineEnd", "meta+right", "\u0005"],
] as const;

@injectable()
export class TerminalControls
  implements CommandContribution, KeybindingContribution, FrontendApplicationContribution
{
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(TerminalService)
  protected readonly terminalService!: TerminalService;

  @inject(FrontendApplicationStateService)
  protected readonly stateService!: FrontendApplicationStateService;

  protected stateListener: Disposable | undefined;

  protected zoomed: { panel: DockPanel; layout: DockLayout.ILayoutConfig } | undefined;

  onStart(): void {
    this.stateListener = this.stateService.onStateChanged((state) => {
      if (state === "closing_window") {
        this.restoreZoom();
      }
    });
  }

  onStop(): void {
    this.stateListener?.dispose();
  }

  registerCommands(commands: CommandRegistry): void {
    const searchTerminal = (): TerminalWidget | undefined =>
      this.terminalService.all.find((terminal) => {
        const search = terminal.getSearchBox();
        return search.isVisible && search.node.contains(document.activeElement);
      });
    commands.registerCommand(
      { id: "ai1.terminal.closeSearch" },
      {
        isEnabled: () => !!searchTerminal(),
        execute: () => searchTerminal()?.getSearchBox().hide(),
      },
    );
    const register = (name: string, execute: () => void): void => {
      commands.registerCommand(
        { id: `ai1.terminal.${name}` },
        {
          isEnabled: () => this.shell.currentWidget instanceof TerminalWidget,
          execute,
        },
      );
    };
    for (const [name, , text] of EDITING) {
      register(name, () => (this.shell.currentWidget as TerminalWidget).sendText(text));
    }
    register("previousSplit", () => this.cycle(-1));
    register("nextSplit", () => this.cycle(1));
    register("zoomSplit", () => this.toggleZoom());
    for (const direction of DIRECTIONS) {
      register(`focus${direction}`, () => this.focusDirection(direction));
      register(`resize${direction}`, () => this.resize(direction));
    }
  }

  registerKeybindings(registry: KeybindingRegistry): void {
    registry.registerKeybinding({ command: "ai1.terminal.closeSearch", keybinding: "esc" });
    const bind = (name: string, keybinding: string): void => {
      registry.registerKeybinding({ command: `ai1.terminal.${name}`, keybinding, when: "terminalFocus" });
    };
    for (const [name, keybinding] of EDITING) {
      bind(name, keybinding);
    }
    bind("previousSplit", "meta+[");
    bind("nextSplit", "meta+]");
    bind("zoomSplit", "meta+shift+enter");
    for (const direction of DIRECTIONS) {
      bind(`focus${direction}`, `meta+alt+${direction}`);
      bind(`resize${direction}`, `meta+ctrl+${direction}`);
    }
  }

  protected panel(): DockPanel | undefined {
    const widget = this.shell.currentWidget;
    const area = widget && this.shell.getAreaFor(widget);
    return area === "main" ? this.shell.mainPanel : area === "bottom" ? this.shell.bottomPanel : undefined;
  }

  protected terminals(): TerminalWidget[] {
    const panel = this.panel();
    return panel
      ? Array.from(panel.tabBars()).flatMap((bar) => {
          const widget = bar.currentTitle?.owner;
          return widget instanceof TerminalWidget ? [widget] : [];
        })
      : [];
  }

  protected cycle(step: number): void {
    this.restoreZoom();
    const terminals = this.terminals();
    const index = terminals.indexOf(this.shell.currentWidget as TerminalWidget);
    const target = terminals[(index + step + terminals.length) % terminals.length];
    if (target) {
      void this.shell.activateWidget(target.id);
    }
  }

  protected focusDirection(direction: Direction): void {
    this.restoreZoom();
    const current = this.shell.currentWidget;
    if (!current) {
      return;
    }
    const origin = current.node.getBoundingClientRect();
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    const center = (rect: DOMRect): [number, number] => [rect.x + rect.width / 2, rect.y + rect.height / 2];
    const [x, y] = center(origin);
    const targets = this.terminals()
      .filter((widget) => widget !== current)
      .map((widget) => {
        const [tx, ty] = center(widget.node.getBoundingClientRect());
        const forward = (horizontal ? tx - x : ty - y) * sign;
        const sideways = Math.abs(horizontal ? ty - y : tx - x);
        return { widget, forward, distance: forward + sideways * 2 };
      })
      .filter((target) => target.forward > 1)
      .sort((a, b) => a.distance - b.distance);
    if (targets[0]) {
      void this.shell.activateWidget(targets[0].widget.id);
    }
  }

  protected resize(direction: Direction): void {
    if (this.zoomed) {
      return;
    }
    const panel = this.panel();
    const widget = this.shell.currentWidget;
    if (!panel || !widget) {
      return;
    }
    const layout = panel.layout as DockLayout;
    const rect = widget.node.getBoundingClientRect();
    const horizontal = direction === "left" || direction === "right";
    const handles = Array.from(layout.handles()).filter(
      (handle) => !handle.classList.contains("lm-mod-hidden"),
    );
    const candidates = handles
      .map((handle) => {
        const bounds = handle.getBoundingClientRect();
        const matching = horizontal ? bounds.height > bounds.width : bounds.width > bounds.height;
        const overlap = horizontal
          ? Math.min(bounds.bottom, rect.bottom) - Math.max(bounds.top, rect.top)
          : Math.min(bounds.right, rect.right) - Math.max(bounds.left, rect.left);
        const distance = horizontal
          ? Math.min(Math.abs(bounds.x - rect.left), Math.abs(bounds.x - rect.right))
          : Math.min(Math.abs(bounds.y - rect.top), Math.abs(bounds.y - rect.bottom));
        return { handle, matching, overlap, distance };
      })
      .filter((item) => item.matching && item.overlap > 0 && item.distance < 12)
      .sort((a, b) => a.distance - b.distance);
    const handle = candidates[0]?.handle;
    if (handle) {
      const delta = direction === "left" || direction === "up" ? -10 : 10;
      layout.moveHandle(
        handle,
        handle.offsetLeft + (horizontal ? delta : 0),
        handle.offsetTop + (horizontal ? 0 : delta),
      );
    }
  }

  protected toggleZoom(): void {
    if (this.zoomed) {
      this.restoreZoom();
      return;
    }
    const panel = this.panel();
    const current = this.shell.currentWidget;
    if (panel && current && Array.from(panel.tabBars()).length > 1) {
      this.zoomed = { panel, layout: panel.saveLayout() };
      panel.mode = "single-document";
      panel.activateWidget(current);
    }
  }

  restoreZoom(): void {
    const saved = this.zoomed;
    if (!saved) {
      return;
    }
    this.zoomed = undefined;
    const current = this.shell.currentWidget;
    const widgets = Array.from(saved.panel.widgets());
    const present = new Set<Widget>();
    const prune = (area: DockLayout.AreaConfig | null): DockLayout.AreaConfig | null => {
      if (!area) {
        return null;
      }
      if (area.type === "tab-area") {
        const kept = area.widgets.filter((widget) => !widget.isDisposed && widgets.includes(widget));
        kept.forEach((widget) => present.add(widget));
        return kept.length
          ? { ...area, widgets: kept, currentIndex: Math.min(area.currentIndex, kept.length - 1) }
          : null;
      }
      const children = area.children
        .map((child, index) => ({ child: prune(child), size: area.sizes[index] }))
        .filter((entry): entry is { child: DockLayout.AreaConfig; size: number } => entry.child !== null);
      return children.length
        ? {
            ...area,
            children: children.map((entry) => entry.child),
            sizes: children.map((entry) => entry.size),
          }
        : null;
    };
    saved.panel.mode = "multiple-document";
    saved.panel.restoreLayout({ main: prune(saved.layout.main) });
    for (const widget of widgets) {
      if (!widget.isDisposed && !present.has(widget)) {
        saved.panel.addWidget(widget, {
          mode: "tab-after",
          ref: current && present.has(current) ? current : undefined,
        });
      }
    }
    if (current && !current.isDisposed) {
      void this.shell.activateWidget(current.id);
    }
  }
}
