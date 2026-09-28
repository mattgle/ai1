import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let home: string;
let configDir: string;
let userDataDir: string;
let priorHome: string | undefined;
let priorConfigDir: string | undefined;

test.beforeAll(async ({ playwright, browser }) => {
  priorHome = process.env.HOME;
  priorConfigDir = process.env.THEIA_CONFIG_DIR;
  home = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-cookie-home-"));
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-cookie-config-"));
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-cookie-userdata-"));
  process.env.HOME = home;
  process.env.THEIA_CONFIG_DIR = configDir;
  const chromeRoot = path.join(home, "Library", "Application Support", "Google", "Chrome");
  const chromeProfile = path.join(chromeRoot, "Default");
  fs.mkdirSync(path.join(chromeProfile, "Network"), { recursive: true });
  fs.writeFileSync(
    path.join(chromeRoot, "Local State"),
    JSON.stringify({ profile: { info_cache: { Default: { name: "AI1 Fixture Profile" } } } }),
  );
  fs.writeFileSync(path.join(chromeProfile, "Network", "Cookies"), "fixture only; do not open");

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
    if (priorHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = priorHome;
    }
    if (priorConfigDir === undefined) {
      delete process.env.THEIA_CONFIG_DIR;
    } else {
      process.env.THEIA_CONFIG_DIR = priorConfigDir;
    }
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(configDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the profile manager confirms cookie import before it reads the source", async () => {
  await app.quickCommandPalette.trigger("Browser: Manage Profiles");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Import Cookies…" }).click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Default" }).click();
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "Google Chrome · AI1 Fixture Profile" })
    .click();
  await expect(app.page.getByText(/Import login cookies from Google Chrome/).first()).toBeVisible();
  await expect(app.page.getByRole("button", { name: "Import" })).toBeVisible();
});
