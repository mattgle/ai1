import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { injectable } from "@theia/core/shared/inversify";
import { app, BrowserWindow } from "electron";

// Set only by the e2e script. It keeps the test windows behind the user's own
// windows: a window shows without the focus, and the app has no Dock icon.
export const BACKGROUND_ENV = "AI1_E2E_BACKGROUND";

// Theia shows each window with `show()`, which on macOS also brings it to the
// front and gives it the focus. `showInactive()` shows it without the focus.
export function showInBackground(window: Pick<BrowserWindow, "show" | "showInactive">): void {
  window.show = () => window.showInactive();
}

@injectable()
export class BackgroundWindowContribution implements ElectronMainApplicationContribution {
  onStart(_application: ElectronMainApplication): void {
    if (process.env[BACKGROUND_ENV] !== "1") {
      return;
    }
    app.dock?.hide();
    app.on("browser-window-created", (_event, window) => showInBackground(window));
  }
}
