import { ApplicationShell, KeybindingContribution } from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry, isOSX } from "@theia/core/lib/common";
import { KeybindingRegistry } from "@theia/core/lib/browser/keybinding";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FILE_NAVIGATOR_TOGGLE_COMMAND_ID } from "@theia/navigator/lib/browser/navigator-contribution";
import { selectPanel } from "./pane-selection";

export const PanelNavigationCommands: readonly Command[] = Array.from({ length: 9 }, (_, index) => ({
  id: `ai1.panels.select${index + 1}`,
  label: `Focus Panel ${index + 1}`,
}));

export const TabNavigationCommands: readonly Command[] = Array.from({ length: 9 }, (_, index) => ({
  id: `ai1.tabs.select${index + 1}`,
  label: `Focus Tab ${index + 1} in Current Panel`,
}));

@injectable()
export class TabNavigationContribution implements CommandContribution, KeybindingContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  registerCommands(commands: CommandRegistry): void {
    for (const [index, command] of PanelNavigationCommands.entries()) {
      commands.registerCommand(command, {
        execute: () => {
          const panels = Array.from(this.shell.mainPanel.tabBars()).flatMap((bar) => {
            const widget = bar.currentTitle?.owner;
            const rect = bar.node.getBoundingClientRect();
            return widget && rect.width > 0 && rect.height > 0
              ? [{ id: widget.id, x: rect.x, y: rect.y }]
              : [];
          });
          const target = selectPanel(panels, index);
          return target ? this.shell.activateWidget(target) : undefined;
        },
      });
    }
    for (const [index, command] of TabNavigationCommands.entries()) {
      commands.registerCommand(command, {
        execute: () => {
          const current = this.shell.mainPanel.currentTitle?.owner;
          const bar =
            current &&
            Array.from(this.shell.mainPanel.tabBars()).find((bar) =>
              bar.titles.some((title) => title.owner === current),
            );
          const target = bar?.titles[index]?.owner;
          return target ? this.shell.activateWidget(target.id) : undefined;
        },
      });
    }
    commands.registerCommand(
      { id: "ai1.center.focus", label: "Focus Last Center Panel" },
      {
        execute: () => {
          const target = this.shell.mainPanel.currentTitle?.owner;
          return target && !target.isDisposed ? this.shell.activateWidget(target.id) : undefined;
        },
      },
    );
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    if (isOSX) keybindings.registerKeybinding({ command: "ai1.center.focus", keybinding: "meta+ctrl+0" });
    keybindings.registerKeybindings(
      { command: FILE_NAVIGATOR_TOGGLE_COMMAND_ID, keybinding: "ctrlcmd+b" },
      ...PanelNavigationCommands.map((command, index) => ({
        command: command.id,
        keybinding: `${isOSX ? "meta+ctrl" : "ctrl+alt"}+${index + 1}`,
      })),
      ...TabNavigationCommands.map((command, index) => ({
        command: command.id,
        keybinding: `ctrlcmd+${index + 1}`,
      })),
    );
  }
}
