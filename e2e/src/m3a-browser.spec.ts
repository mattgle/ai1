import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;
let fixture: BrowserFixtureServer;

function mainTab(text: string) {
  return app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: text });
}

async function openTab(url: string, profileName?: string): Promise<void> {
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

test.beforeAll(async ({ playwright, browser }) => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  fixture = new BrowserFixtureServer();
  await fixture.start();
  app = await TheiaAppLoader.load(
    {
      playwright,
      browser,
      useElectron: {
        launchOptions: {
          additionalArgs: [
            "--no-sandbox",
            "--no-cluster",
            `--user-data-dir=${userDataDir}`,
            `--electronUserData=${userDataDir}`,
          ],
          electronAppPath,
          pluginsPath,
        },
      },
    },
    workspace,
  );
});

test.afterAll(async () => {
  try {
    await app.page.close();
  } finally {
    await fixture.stop();
    fs.rmSync(configDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
  }
});

test("the preload API lists the Default and Agent profiles", async () => {
  const profiles = await app.page.evaluate(() =>
    (
      window as unknown as { electronAi1Browser: { listProfiles(): Promise<unknown> } }
    ).electronAi1Browser.listProfiles(),
  );
  expect(profiles).toEqual([
    { id: "default", name: "Default" },
    { id: "agent", name: "Agent" },
  ]);
});

test("a word in the address bar shows the hint and does not navigate", async () => {
  await openTab("hello world");
  await expect(app.page.locator(".ai1-browser:not(.lm-mod-hidden) .ai1-browser-message")).toHaveText(
    "Type a full address, for example localhost:3000 or example.com",
  );
});

test("a form post and a redirect work in a tab", async () => {
  await openTab(`${fixture.url}form`);
  await expect(mainTab("Welcome")).toBeVisible();
});

test("a cookie of the Default profile is not visible in the Agent profile", async () => {
  await openTab(`${fixture.url}set-cookie`);
  await expect(mainTab("Cookie set")).toBeVisible();
  await openTab(`${fixture.url}read-cookie`);
  await expect(mainTab("cookie: ai1test=1")).toBeVisible();
  await openTab(`${fixture.url}read-cookie`, "Agent");
  await expect(mainTab("cookie: none")).toBeVisible();
});

test("a login popup opens and can talk to its opener", async () => {
  await openTab(`${fixture.url}popup-opener`);
  await expect(mainTab("Popup done")).toBeVisible();
});

test("a page that does not load shows the error and a Retry button", async () => {
  await openTab("http://127.0.0.1:9/");
  await expect(app.page.locator(".ai1-browser:not(.lm-mod-hidden) .ai1-browser-retry")).toBeVisible();
});

test("a tab of a deleted profile moves to Default", async () => {
  const api = "window.electronAi1Browser";
  const created = (await app.page.evaluate(`${api}.addProfile("Temp")`)) as { id: string };
  await openTab(`${fixture.url}`, "Temp");
  const select = app.page.locator(".ai1-browser:not(.lm-mod-hidden) .ai1-browser-profile");
  await expect(select).toHaveValue(created.id);
  await app.page.evaluate(`${api}.deleteProfile("${created.id}")`);
  await expect(select).toHaveValue("default");
});

test("a ⌘-click on a terminal link asks one time, then opens the AI1 tab", async () => {
  await app.quickCommandPalette.trigger("Terminal: Create New Terminal");
  const screen = app.page.locator(".terminal-container:not(.lm-mod-hidden) .xterm-screen").last();
  await expect(screen).toBeVisible();
  // xterm keeps the real input focus on a hidden textarea, not the screen.
  // Monaco clears the `inQuickInput` context in a timer after the command
  // palette loses the focus. Until then, Theia gives Enter to the palette,
  // and typing right after the command races that binding. Wait for that
  // textarea to have the focus, then one page timer turn, as `openTab` does.
  const input = app.page.locator(".terminal-container:not(.lm-mod-hidden) .xterm-helper-textarea").last();
  await expect(input).toBeFocused();
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await app.page.keyboard.type(`clear; printf '%s\\n' ${fixture.url}button`);
  await app.page.keyboard.press("Enter");

  // The terminal draws with WebGL, so there is no DOM text to read. Find the
  // real size of one character cell from xterm's own hidden measuring
  // element, and use it to aim the mouse at a point inside the address
  // (a few columns in, well clear of column 0), on the first row (the
  // address is the only text there once `clear` has run).
  const cellBox = (await app.page
    .locator(".terminal-container:not(.lm-mod-hidden) .xterm-char-measure-element")
    .last()
    .boundingBox())!;
  const cellWidth = cellBox.width / 32;
  const cellHeight = cellBox.height;

  // xterm only finds a link on hover, and that lookup is asynchronous, so
  // retry the hover until xterm shows the link cursor before clicking. This
  // also absorbs the time the shell needs to run `clear` and print the
  // address. Each retry moves away first: Playwright drops a `mouse.move`
  // to the same point it already reports the mouse at, and a dropped move
  // never asks xterm again.
  let point = { x: 0, y: 0 };
  let hovered = false;
  for (let attempt = 0; attempt < 20 && !hovered; attempt++) {
    const box = (await screen.boundingBox())!;
    point = { x: box.x + cellWidth * 3.5, y: box.y + cellHeight / 2 };
    await app.page.mouse.move(box.x, box.y + box.height - 1);
    await app.page.mouse.move(point.x, point.y);
    await app.page.waitForTimeout(250);
    hovered = await app.page.evaluate(
      () =>
        document
          .querySelector(".terminal-container:not(.lm-mod-hidden) .xterm-screen")
          ?.classList.contains("xterm-cursor-pointer") ?? false,
    );
  }
  expect(hovered, "xterm did not show the link cursor for the address on the first row").toBe(true);

  await app.page.keyboard.down("Meta");
  await app.page.mouse.click(point.x, point.y);
  await app.page.keyboard.up("Meta");
  await app.page.getByRole("button", { name: "AI1 Browser" }).click();
  // `BrowserTabs.open` adds the new tab next to the widget that had the
  // focus, which is the terminal here, so the tab can land in the bottom
  // panel instead of the main one. Any tab bar is a valid place to find it.
  await expect(app.page.locator(".lm-TabBar-tab", { hasText: "Button" })).toBeVisible();
  const settings = fs.readFileSync(path.join(configDir, "settings.json"), "utf8");
  expect(JSON.parse(settings)["ai1.browser.openLinksIn"]).toBe("ai1");
});
