import { ApplicationShell, KeybindingContribution } from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry } from "@theia/core/lib/common";
import { KeybindingRegistry } from "@theia/core/lib/browser/keybinding";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FILE_NAVIGATOR_TOGGLE_COMMAND_ID } from "@theia/navigator/lib/browser/navigator-contribution";
import { selectTabAtIndex } from "./tab-selection";

export const TabNavigationCommands = {
  SELECT_TAB_1: { id: "ai1.tabs.select1" },
  SELECT_TAB_2: { id: "ai1.tabs.select2" },
} satisfies Record<string, Command>;

@injectable()
export class TabNavigationContribution implements CommandContribution, KeybindingContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  registerCommands(commands: CommandRegistry): void {
    for (const [index, command] of [
      TabNavigationCommands.SELECT_TAB_1,
      TabNavigationCommands.SELECT_TAB_2,
    ].entries()) {
      commands.registerCommand(command, {
        isEnabled: () => Boolean(this.shell.currentTabBar && this.shell.currentTabBar.titles.length > index),
        execute: () => selectTabAtIndex(this.shell.currentTabBar, index),
      });
    }
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    keybindings.registerKeybindings(
      { command: FILE_NAVIGATOR_TOGGLE_COMMAND_ID, keybinding: "ctrlcmd+b" },
      { command: TabNavigationCommands.SELECT_TAB_1.id, keybinding: "ctrlcmd+1" },
      { command: TabNavigationCommands.SELECT_TAB_2.id, keybinding: "ctrlcmd+2" },
      { command: "workbench.action.focusFirstEditorGroup", keybinding: "ctrlcmd+shift+1" },
      { command: "workbench.action.focusSecondEditorGroup", keybinding: "ctrlcmd+shift+2" },
    );
  }
}
