import * as fs from "node:fs";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Browser, chromium, expect, Locator, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { clickTab } from "./click-tab";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;
let fixture: BrowserFixtureServer;
let agentPort: number;

async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// The secret of this run is in its own temporary user data folder.
function connectAgent(): Promise<Browser> {
  const secret = fs.readFileSync(path.join(userDataDir, "ai1-browser-agent-secret"), "utf8").trim();
  return chromium.connectOverCDP(`http://127.0.0.1:${agentPort}/${secret}/`);
}

function pagesOf(browser: Browser) {
  return browser.contexts().flatMap((context) => context.pages());
}

function mainTab(text: string): Locator {
  return app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: text });
}

async function agentNumber(tab: Locator): Promise<number> {
  const match = ((await tab.textContent()) ?? "").match(/Agent (\d+) · /);
  return match ? Number(match[1]) : -1;
}

async function closeTab(tab: Locator): Promise<void> {
  await clickTab(tab, { button: "right" });
  await app.page.locator(".lm-Menu-item", { hasText: /^Close$/ }).click();
}

test.beforeAll(async ({ playwright, browser }) => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3b-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  agentPort = await freePort();
  fs.writeFileSync(
    path.join(configDir, "settings.json"),
    JSON.stringify({ "ai1.browser.agentAddress.enabled": true, "ai1.browser.agentAddress.port": agentPort }),
  );
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3b-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
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
  // The agent address starts after the preferences are ready.
  await expect
    .poll(() => fs.existsSync(path.join(userDataDir, "ai1-browser-agent-secret")), { timeout: 30_000 })
    .toBe(true);
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

test("two agents connect at the same time, and each agent has its own tab and sees only its own page", async () => {
  const [first, second] = await Promise.all([connectAgent(), connectAgent()]);
  try {
    expect(pagesOf(first)).toHaveLength(1);
    expect(pagesOf(second)).toHaveLength(1);
    const firstPage = pagesOf(first)[0];
    const secondPage = pagesOf(second)[0];
    await firstPage.goto(`${fixture.url}welcome`);
    await secondPage.goto(`${fixture.url}button`);
    await expect(firstPage).toHaveTitle("Welcome");
    await expect(secondPage).toHaveTitle("Button");
    expect(pagesOf(first)).toHaveLength(1);
    expect(pagesOf(second)).toHaveLength(1);

    const agentTabs = app.page.locator(
      "#theia-main-content-panel .lm-TabBar-tab.ai1-browser-agent-connected",
    );
    await expect(agentTabs).toHaveCount(2);
    const firstTab = mainTab("Welcome");
    const secondTab = mainTab("Button");
    await expect(firstTab).toHaveText(/Agent \d+ · Welcome/);
    await expect(secondTab).toHaveText(/Agent \d+ · Button/);
    await expect(firstTab).toHaveClass(/ai1-browser-agent-tab/);
    await expect(secondTab).toHaveClass(/ai1-browser-agent-tab/);
    expect(await agentNumber(firstTab)).not.toBe(await agentNumber(secondTab));

    await closeTab(secondTab);
    await expect.poll(() => second.isConnected()).toBe(false);
    expect(first.isConnected()).toBe(true);
    await expect(firstPage).toHaveTitle("Welcome");
    await expect(agentTabs).toHaveCount(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("Give to agent marks a tab as waiting, and the next agent takes that tab", async () => {
  await openBrowserTab(app, `${fixture.url}welcome`);
  const tab = mainTab("Welcome").and(app.page.locator(".lm-mod-current"));
  await expect(tab).toHaveText(/Welcome/);
  const tabId = await tab.getAttribute("id");
  const givenTab = app.page.locator(`[id="${tabId}"]`);
  const giveButton = app.page.locator(".ai1-browser:not(.lm-mod-hidden) .ai1-browser-give-to-agent");

  await giveButton.click();
  await expect(givenTab).toHaveClass(/ai1-browser-agent-waiting/);
  await expect(giveButton).toHaveClass(/ai1-browser-agent-active/);
  await app.quickCommandPalette.trigger("Browser: Cancel Give to Agent");
  await expect(givenTab).not.toHaveClass(/ai1-browser-agent-waiting/);
  await giveButton.click();
  await expect(givenTab).toHaveClass(/ai1-browser-agent-waiting/);

  const browser = await connectAgent();
  try {
    expect(pagesOf(browser)).toHaveLength(1);
    await expect(pagesOf(browser)[0]).toHaveTitle("Welcome");
    await expect(givenTab).toHaveClass(/ai1-browser-agent-connected/);
    await expect(givenTab).not.toHaveClass(/ai1-browser-agent-waiting/);
    await expect(givenTab).toHaveText(/Agent \d+ · Welcome/);
    await expect(giveButton).toBeDisabled();
  } finally {
    await browser.close();
  }
  await expect(givenTab).not.toHaveClass(/ai1-browser-agent/);
  await expect(givenTab).not.toHaveText(/Agent/);
  await expect(giveButton).toBeEnabled();
});
