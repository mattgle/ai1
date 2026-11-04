import { KeybindingContribution, KeybindingRegistry } from "@theia/core/lib/browser/keybinding";
import { isOSX } from "@theia/core/lib/common/os";
import { injectable } from "@theia/core/shared/inversify";

@injectable()
export class ExplorerKeybindings implements KeybindingContribution {
  registerKeybindings(registry: KeybindingRegistry): void {
    if (!isOSX) return;
    registry.unregisterKeybinding({ id: "file.rename" });
    registry.registerKeybinding({
      command: "file.rename",
      keybinding: "enter",
      when: "filesExplorerFocus && !inputFocus",
    });
  }
}
