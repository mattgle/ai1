import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;

test.beforeAll(async ({ playwright, browser }) => {
  // The application must not write into the real settings folder of the
  // machine during a test run. Playwright's Electron launch inherits the
  // runner's environment, so this folder becomes the app's settings folder.
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  app = await TheiaAppLoader.load(
    { playwright, browser, useElectron: { electronAppPath, pluginsPath } },
    workspace,
  );
});

test.afterAll(async () => {
  await app.page.close();
  fs.rmSync(configDir, { recursive: true, force: true });
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

test("no Theia AI user interface shows", async () => {
  await expect(app.page.locator("[id*='ai-chat'], [id*='ai-configuration']")).toHaveCount(0);
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
  await expect(settings).not.toContainText("AI Features");
});
