import { expect } from "@playwright/test";
import { TheiaApp } from "@theia/playwright";

// Opens a new AI1 browser tab with the command palette, types `url` in its
// address bar, and presses Enter.
export async function openBrowserTab(app: TheiaApp, url: string, profileName?: string): Promise<void> {
  const tabs = app.page.locator(".ai1-browser");
  const count = await tabs.count();
  if (profileName) {
    await app.quickCommandPalette.trigger("Browser: New Tab in Profile…", profileName);
  } else {
    await app.quickCommandPalette.trigger("Browser: New Tab");
  }
  // `trigger` returns before the command is done. The command is done when
  // the address of the new tab has the focus.
  const address = tabs.nth(count).locator(".ai1-browser-address");
  await expect(address).toBeFocused();
  // Monaco clears the `inQuickInput` context in a timer after the command
  // palette loses the focus. Until then, Theia gives Enter to the palette.
  // Chromium sends input before timers, so wait for one timer turn.
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await address.fill(url);
  await address.press("Enter");
}
