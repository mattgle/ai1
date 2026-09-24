import { OpenHandler } from "@theia/core/lib/browser";
import { WindowService } from "@theia/core/lib/browser/window/window-service";
import { MessageService, URI } from "@theia/core/lib/common";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { decideLinkTarget, OpenLinksIn } from "../common/link-choice";
import { DEFAULT_PROFILE_ID } from "../common/profiles";
import { userPreference } from "../common/user-preference";
import { OPEN_LINKS_IN } from "./browser-preferences";
import { BrowserTabs } from "./browser-tabs";
import { ShiftTracker } from "./shift-tracker";

const AI1_BROWSER = "AI1 Browser";
const SYSTEM_BROWSER = "System Browser";

// Takes every http and https link that AI1 opens (priority 1000, above
// Theia's own handler at 500): the terminal, the editor, and the Markdown
// preview.
@injectable()
export class BrowserOpenHandler implements OpenHandler {
  readonly id = "ai1-browser";
  readonly label = AI1_BROWSER;

  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(WindowService)
  protected readonly windowService!: WindowService;

  @inject(BrowserTabs)
  protected readonly tabs!: BrowserTabs;

  @inject(ShiftTracker)
  protected readonly shift!: ShiftTracker;

  canHandle(uri: URI): number {
    return uri.scheme === "http" || uri.scheme === "https" ? 1000 : 0;
  }

  async open(uri: URI): Promise<undefined> {
    const url = uri.toString(true);
    const setting = userPreference<OpenLinksIn>(this.preferences, OPEN_LINKS_IN, "ask");
    let target = decideLinkTarget(setting, this.shift.wasShiftHeld());
    if (target === "ask") {
      const answer = await this.messages.info(
        "Open web links in AI1 Browser or in the system browser?",
        AI1_BROWSER,
        SYSTEM_BROWSER,
      );
      if (answer === undefined) {
        return undefined;
      }
      target = answer === AI1_BROWSER ? "ai1" : "system";
      await this.preferences.set(OPEN_LINKS_IN, target, PreferenceScope.User);
    }
    if (target === "ai1") {
      await this.tabs.open(url, DEFAULT_PROFILE_ID);
    } else {
      this.windowService.openNewWindow(url, { external: true });
    }
    return undefined;
  }
}
