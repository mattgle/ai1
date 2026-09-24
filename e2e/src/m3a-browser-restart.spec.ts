import * as fs from "node:fs";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";

// Theia restores the browser tabs of the saved layout at the start. This test
// needs two app starts with the same user data folder, so it starts Electron
// itself, as `m2-agents-restart.spec.ts` does (see there for the reasons).

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

async function launchApp(workspacePath: string, userDataDir: string) {
  const electronApp = await electron.launch({
    args: [
      electronAppPath,
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${electronAppPath}`,
      `--plugins=local-dir:${pluginsPath}`,
      `--user-data-dir=${userDataDir}`,
      `--electronUserData=${userDataDir}`,
      workspacePath,
    ],
  });
  const page = await electronApp.firstWindow();
  const app = new TheiaApp(page, new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  return { app, electronApp };
}

async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

let configDir: string;
let userDataDir: string;
let workspacePath: string;
let fixture: BrowserFixtureServer;

test.beforeAll(async () => {
  // The real path: the file watcher of the user settings reports real paths,
  // and the temporary folder of macOS is under a symbolic link.
  configDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-restart-config-")));
  process.env.THEIA_CONFIG_DIR = configDir;
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-restart-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  workspacePath = fs.realpathSync(workspace.path);
  fixture = new BrowserFixtureServer();
  await fixture.start();
});

test.afterAll(async () => {
  try {
    await fixture.stop();
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
  }
});

test("a restored tab gets the profile list, and moves to Default when its profile is gone", async () => {
  let tempId: string;
  const start1 = await launchApp(workspacePath, userDataDir);
  try {
    const created = (await start1.app.page.evaluate(`window.electronAi1Browser.addProfile("Temp")`)) as {
      id: string;
    };
    tempId = created.id;
    await openBrowserTab(start1.app, fixture.url, "Temp");
    await expect(
      start1.app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "Start" }),
    ).toBeVisible();
    await expect(start1.app.page.locator(".ai1-browser-profile")).toHaveValue(tempId);
  } finally {
    await start1.electronApp.close();
  }

  // The profile disappears while AI1 is closed.
  const storePath = path.join(userDataDir, "ai1-browser-profiles.json");
  const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { profiles: { id: string }[] };
  store.profiles = store.profiles.filter((profile) => profile.id !== tempId);
  fs.writeFileSync(storePath, JSON.stringify(store));

  const start2 = await launchApp(workspacePath, userDataDir);
  try {
    const tab = start2.app.page.locator(".ai1-browser");
    await expect(tab).toHaveCount(1);
    const select = tab.locator(".ai1-browser-profile");
    await expect(select.locator("option")).toHaveText(["Default", "Agent"]);
    await expect(select).toHaveValue("default");
  } finally {
    await start2.electronApp.close();
  }
});

test("the settings of a repository do not turn on the agent address", async () => {
  // The user settings of this file are empty. Only the workspace settings of
  // the opened folder turn the agent address on.
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  const repositoryPath = fs.realpathSync(workspace.path);
  const port = await freePort();
  fs.mkdirSync(path.join(repositoryPath, ".theia"), { recursive: true });
  fs.writeFileSync(
    path.join(repositoryPath, ".theia", "settings.json"),
    JSON.stringify({ "ai1.browser.agentAddress.enabled": true, "ai1.browser.agentAddress.port": port }),
  );
  const ownUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-scope-userdata-"));
  try {
    const start = await launchApp(repositoryPath, ownUserDataDir);
    try {
      // The agent address starts after the preferences are ready. Give it
      // time to start, if it does.
      await start.app.page.waitForTimeout(3000);
      // Compare in the page, so that a failure does not print the address
      // with its secret.
      const off = await start.app.page.evaluate(
        "window.electronAi1Browser.agentAddress().then((a) => a === undefined)",
      );
      expect(off).toBe(true);
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    } finally {
      await start.electronApp.close();
    }
  } finally {
    await removeTempDir(ownUserDataDir);
  }
});

test("the owner turns the agent address off in the user settings, also when a repository turns it on", async () => {
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  const repositoryPath = fs.realpathSync(workspace.path);
  const port = await freePort();
  const settings = { "ai1.browser.agentAddress.enabled": true, "ai1.browser.agentAddress.port": port };
  fs.mkdirSync(path.join(repositoryPath, ".theia"), { recursive: true });
  fs.writeFileSync(path.join(repositoryPath, ".theia", "settings.json"), JSON.stringify(settings));
  const userSettingsPath = path.join(configDir, "settings.json");
  fs.writeFileSync(userSettingsPath, JSON.stringify(settings));
  const ownUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-scope-userdata-"));
  // Compare in the page, so that a failure does not print the address with
  // its secret.
  const isOn = (page: TheiaApp["page"]) =>
    page.evaluate("window.electronAi1Browser.agentAddress().then((a) => a !== undefined)");
  try {
    const start = await launchApp(repositoryPath, ownUserDataDir);
    try {
      await expect.poll(() => isOn(start.app.page)).toBe(true);
      fs.writeFileSync(
        userSettingsPath,
        JSON.stringify({ ...settings, "ai1.browser.agentAddress.enabled": false }),
      );
      await expect.poll(() => isOn(start.app.page), { timeout: 15_000 }).toBe(false);
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    } finally {
      await start.electronApp.close();
    }
  } finally {
    fs.rmSync(userSettingsPath, { force: true });
    await removeTempDir(ownUserDataDir);
  }
});
