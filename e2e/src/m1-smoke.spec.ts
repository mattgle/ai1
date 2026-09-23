import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;

test.beforeAll(async ({ playwright, browser }) => {
  // The application must not write into the real settings folder of the
  // machine during a test run. Playwright's Electron launch inherits the
  // runner's environment, so this folder becomes the app's settings folder.
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  // Electron's own user-data folder (its default is the real `AI1` folder
  // under the machine's application support directory) holds the browser's
  // `localStorage`, which is where the workbench layout lives (Theia's
  // `ShellLayoutRestorer` uses `LocalStorageService`, backed by
  // `window.localStorage`). Two flags are needed to fully redirect it, not
  // one: `--electronUserData` is the app's own flag
  // (`ElectronMainApplication.start()` in `@theia/core/src/electron-main/
  // electron-main-application.ts`), applied by calling `app.setPath(
  // 'userData', ...)`, but too late for `electronStore` (an `electron-store`
  // instance, same file), a class field initializer that reads
  // `app.getPath('userData')` at construction time, before `start()` runs;
  // its file (`config.json`, the window's position and size) would still go
  // to the real folder without also passing Chromium's own native
  // `--user-data-dir`, which every Electron process reads before any of the
  // app's own code runs (this also covers `DevToolsActivePort`, written by
  // Chromium's own DevTools activation, which Playwright's Electron support
  // needs). Confirmed by hand: only with both flags does a full run leave
  // the real folder's newest file time unchanged.
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
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
    fs.rmSync(configDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
  }
});

test("the explorer is in the left panel", async () => {
  await expect(app.page.locator("#theia-left-side-panel #files")).toBeVisible();
});

test("the explorer shows Material icons", async () => {
  await expect(app.page.locator("#files .ai1-mi").first()).toBeVisible();
});

test("the Changes view is in the right panel", async () => {
  await expect(app.page.locator("#theia-right-side-panel #ai1-changes")).toBeVisible();
});

test("the Changes view lists only the dirty repository", async () => {
  const repos = app.page.locator("#ai1-changes .ai1-changes-repo");
  await expect(repos).toHaveCount(1);
  await expect(repos.first()).toContainText("dirty-repo");
  await expect(repos.first()).toContainText("main");
});

test("a single click on a changed file opens a diff in the center", async () => {
  await app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "index.ts" }).click();
  const diff = app.page.locator("#theia-main-content-panel .monaco-diff-editor");
  await expect(diff).toBeVisible();
  await expect(diff).toContainText("value = 1");
  await expect(diff).toContainText("value = 2");
});

test("the command palette lists no AI command", async () => {
  await app.quickCommandPalette.type("AI:");
  await expect(app.page.locator(".quick-input-widget")).toBeVisible();
  const rows = app.page.locator(".quick-input-widget .monaco-list-row");
  await expect(rows.filter({ hasText: "AI:" })).toHaveCount(0);
  await app.quickCommandPalette.hide();
});

test("the Source Control view is not open on the first start", async () => {
  await expect(app.page.locator("#scm-view-container")).toHaveCount(0);
  await expect(app.page.locator("#theia-left-side-panel #files")).toBeVisible();
});

test("the Settings view has no AI entry", async () => {
  // Electron has no in-page menu bar (`#theia:menubar`), so the command
  // palette opens the Settings view instead of the File menu. The palette's
  // own `trigger()` helper loops on an exact "category: label" match that
  // never fires here, so this filters the row by the command's own label
  // and clicks it directly once Monaco's own filtering catches up.
  await app.quickCommandPalette.type("Open Settings (UI)");
  const row = app.page
    .locator(".quick-input-widget .monaco-list-row")
    .filter({ hasText: "Open Settings (UI)" });
  await expect(row).toBeVisible();
  await row.click();
  const settings = app.page.locator("#settings_widget");
  await expect(settings).toBeVisible();
  // Wait for the category tree to render before the negative check, so the
  // check cannot pass only because the tree is still empty.
  await expect(settings.getByText("Text Editor", { exact: true }).first()).toBeVisible();
  await expect(settings).not.toContainText("AI Features");
});
