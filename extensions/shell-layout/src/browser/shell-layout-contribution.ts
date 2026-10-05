import {
  ApplicationShell,
  FrontendApplicationContribution,
  KeybindingRegistry,
} from "@theia/core/lib/browser";
import { isOSX } from "@theia/core/lib/common";
import { BoxLayout, SplitLayout } from "@theia/core/shared/@lumino/widgets";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileNavigatorContribution } from "@theia/navigator/lib/browser/navigator-contribution";
import { ScmContribution } from "@theia/scm/lib/browser/scm-contribution";

// Theia calls initializeLayout only when no saved layout exists, and calls
// onDidInitializeLayout on each start. The flag connects the two calls, so
// the changes below apply only to the default layout. The Changes view opens
// itself in the right area.
@injectable()
export class ShellLayoutContribution implements FrontendApplicationContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(KeybindingRegistry)
  protected readonly keybindings!: KeybindingRegistry;

  @inject(FileNavigatorContribution)
  protected readonly navigator!: FileNavigatorContribution;

  @inject(ScmContribution)
  protected readonly scm!: ScmContribution;

  protected isDefaultLayout = false;

  async initializeLayout(): Promise<void> {
    this.isDefaultLayout = true;
  }

  // Runs on each start, after all contributions made the layout. Only the
  // default layout changes here. A saved layout stays as the user left it.
  onStart(): void {
    if (isOSX) this.keybindings.unregisterKeybinding({ id: "close.window" });
    const bottomArea = this.shell.mainPanel.parent;
    const sideAreas = bottomArea?.parent;
    for (const panel of [bottomArea, sideAreas]) {
      if (panel?.layout instanceof SplitLayout) panel.layout.spacing = 4;
    }
    for (const handler of [this.shell.leftPanelHandler, this.shell.rightPanelHandler]) {
      if (handler.container.layout instanceof BoxLayout) handler.container.layout.spacing = 0;
    }
    this.shell.fit();
  }

  async onDidInitializeLayout(): Promise<void> {
    if (!this.isDefaultLayout) {
      return;
    }
    // The scm package opens its view in the default layout. AI1 has the
    // Changes view for this job. The view stays available in the View menu.
    await this.scm.closeView();
    await this.navigator.openView({ area: "left", reveal: true });
  }
}
