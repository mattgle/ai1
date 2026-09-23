import { Event as ElectronEvent, WebContents } from "@theia/core/electron-shared/electron";
import { ElectronMainApplication } from "@theia/core/lib/electron-main/electron-main-application";
import { TheiaBrowserWindowOptions } from "@theia/core/lib/electron-main/theia-electron-window";
import { inject, injectable } from "@theia/core/shared/inversify";
import { GuestPolicies } from "./guest-policies";

// Theia gives no setting for the `<webview>` tag, and it blocks navigation
// in every web contents. This subclass turns the tag on and keeps Theia's
// rules for everything except the pages of the AI1 browser.
@injectable()
export class Ai1ElectronMainApplication extends ElectronMainApplication {
  @inject(GuestPolicies)
  protected readonly guestPolicies!: GuestPolicies;

  protected override getDefaultOptions(): TheiaBrowserWindowOptions {
    const options = super.getDefaultOptions();
    return { ...options, webPreferences: { ...options.webPreferences, webviewTag: true } };
  }

  protected override onWebContentsCreated(event: ElectronEvent, webContents: WebContents): void {
    if (this.guestPolicies.isAi1BrowserContents(webContents)) {
      this.guestPolicies.attach(webContents);
      return;
    }
    super.onWebContentsCreated(event, webContents);
    this.guestPolicies.guardWebviewAttach(webContents);
  }
}
