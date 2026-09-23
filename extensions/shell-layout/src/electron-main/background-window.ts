import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { injectable } from "@theia/core/shared/inversify";
import { app, BrowserWindow } from "electron";

// Set only by the e2e script. It keeps the test windows off the user's screen:
// a window never shows, and the app has no Dock icon.
// The script must also set `THEIA_ELECTRON_NO_EARLY_WINDOW=1`. Without it,
// Theia makes and shows the first window before it calls `onStart`, so the
// listener below is too late for that window.
export const BACKGROUND_ENV = "AI1_E2E_BACKGROUND";

type HideableWindow = Pick<BrowserWindow, "show" | "showInactive" | "focus"> & {
  webContents: Pick<BrowserWindow["webContents"], "setBackgroundThrottling">;
};

// On macOS, `showInactive()` does not take the focus, but it still puts the
// window above all other windows, and `focus()` can make the app active. So a
// test window never shows. The tests do not need a visible window: Playwright
// emulates the page focus and sends input to the page directly. Chromium slows
// down the timers and the painting of a hidden page, so that is turned off.
export function keepHidden(window: HideableWindow): void {
  window.show = () => undefined;
  window.showInactive = () => undefined;
  window.focus = () => undefined;
  window.webContents.setBackgroundThrottling(false);
}

@injectable()
export class BackgroundWindowContribution implements ElectronMainApplicationContribution {
  onStart(_application: ElectronMainApplication): void {
    if (process.env[BACKGROUND_ENV] !== "1") {
      return;
    }
    app.dock?.hide();
    app.on("browser-window-created", (_event, window) => keepHidden(window));
  }
}
