import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileNavigatorContribution } from "@theia/navigator/lib/browser/navigator-contribution";
import { ScmContribution } from "@theia/scm/lib/browser/scm-contribution";

// Theia calls initializeLayout only when no saved layout exists, and calls
// onDidInitializeLayout on each start. The flag connects the two calls, so
// the changes below apply only to the default layout. The Changes view opens
// itself in the right area.
@injectable()
export class ShellLayoutContribution implements FrontendApplicationContribution {
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
