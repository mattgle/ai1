import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileNavigatorContribution } from "@theia/navigator/lib/browser/navigator-contribution";

// Theia calls initializeLayout only when no saved layout exists. So this
// default applies on the first start, and later manual changes stay. The
// Changes view opens itself in the right area.
@injectable()
export class ShellLayoutContribution implements FrontendApplicationContribution {
  @inject(FileNavigatorContribution)
  protected readonly navigator!: FileNavigatorContribution;

  async initializeLayout(): Promise<void> {
    await this.navigator.openView({ area: "left", reveal: true });
  }
}
