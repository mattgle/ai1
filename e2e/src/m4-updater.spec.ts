import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let userDataDir: string;

test.beforeAll(async ({ playwright, browser }) => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-m4-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
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
    await app?.page.close();
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the owner can run an update check without applying an update", async () => {
  await app.quickCommandPalette.open();
  await app.quickCommandPalette.type("AI1: Check for Updates");
  const command = app.page.locator(".quick-input-widget .monaco-list-row", {
    hasText: "AI1: Check for Updates",
  });
  await expect(command).toBeVisible();
  await command.click();
  await expect(app.page.getByText("AI1 did not find any update sources to check.").first()).toBeVisible();
});
