import { ApplicationShell, KeybindingContribution } from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry } from "@theia/core/lib/common";
import { KeybindingRegistry } from "@theia/core/lib/browser/keybinding";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FILE_NAVIGATOR_TOGGLE_COMMAND_ID } from "@theia/navigator/lib/browser/navigator-contribution";
import { selectPane } from "./pane-selection";

export const TabNavigationCommands = {
  SELECT_COLUMN_1: { id: "ai1.panes.column1" },
  SELECT_COLUMN_2: { id: "ai1.panes.column2" },
  SELECT_ROW_1: { id: "ai1.panes.row1" },
  SELECT_ROW_2: { id: "ai1.panes.row2" },
} satisfies Record<string, Command>;

@injectable()
export class TabNavigationContribution implements CommandContribution, KeybindingContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  registerCommands(commands: CommandRegistry): void {
    for (const [command, axis, index] of [
      [TabNavigationCommands.SELECT_COLUMN_1, "column", 0],
      [TabNavigationCommands.SELECT_COLUMN_2, "column", 1],
      [TabNavigationCommands.SELECT_ROW_1, "row", 0],
      [TabNavigationCommands.SELECT_ROW_2, "row", 1],
    ] as const) {
      commands.registerCommand(command, {
        execute: () => {
          const panes = Array.from(this.shell.mainPanel.tabBars()).flatMap((bar) => {
            const widget = bar.currentTitle?.owner;
            const rect = bar.node.getBoundingClientRect();
            return widget && rect.width > 0 && rect.height > 0
              ? [{ id: widget.id, x: rect.x, y: rect.y }]
              : [];
          });
          const target = selectPane(panes, this.shell.mainPanel.currentTitle?.owner.id, axis, index);
          if (target) {
            return this.shell.activateWidget(target);
          }
          return undefined;
        },
      });
    }
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    keybindings.registerKeybindings(
      { command: FILE_NAVIGATOR_TOGGLE_COMMAND_ID, keybinding: "ctrlcmd+b" },
      { command: TabNavigationCommands.SELECT_COLUMN_1.id, keybinding: "ctrlcmd+1" },
      { command: TabNavigationCommands.SELECT_COLUMN_2.id, keybinding: "ctrlcmd+2" },
      { command: TabNavigationCommands.SELECT_ROW_1.id, keybinding: "ctrlcmd+shift+1" },
      { command: TabNavigationCommands.SELECT_ROW_2.id, keybinding: "ctrlcmd+shift+2" },
    );
  }
}
