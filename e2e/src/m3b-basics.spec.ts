import * as fs from "node:fs";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Browser, chromium, expect, Locator, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaExplorerView, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer, DOWNLOAD_TEXT } from "./browser-fixture-server";
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
let downloadsDir: string;
let shellLog: string;

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

function activeBrowser(): Locator {
  return app.page.locator(".ai1-browser:not(.lm-mod-hidden)");
}

function browserCount(): Promise<number> {
  return app.page.locator(".ai1-browser").count();
}

// Runs `script` in the page of the browser tab at `index` (in the order of
// the `.ai1-browser` nodes) and gives its result.
function runInTab<T>(index: number, script: string): Promise<T> {
  return app.page.evaluate(
    ([tabIndex, code]) => {
      const webview = document
        .querySelectorAll(".ai1-browser")
        [tabIndex]?.querySelector("webview") as unknown as
        { executeJavaScript(source: string): Promise<unknown> } | undefined;
      if (!webview) {
        throw new Error(`There is no browser tab ${tabIndex}.`);
      }
      return webview.executeJavaScript(code);
    },
    [index, script] as const,
  ) as Promise<T>;
}

function pageRatio(index: number): Promise<number> {
  return runInTab<number>(index, "window.devicePixelRatio");
}

// The zoom of the IDE window: the Theia zoom level and the pixel ratio of
// the IDE page.
function ideZoom(): Promise<{ level: number; ratio: number }> {
  return app.page.evaluate(async () => {
    const core = (window as unknown as { electronTheiaCore: { getZoomLevel(): Promise<number> } })
      .electronTheiaCore;
    return { level: await core.getZoomLevel(), ratio: window.devicePixelRatio };
  });
}

function zoomFile(): unknown {
  return JSON.parse(fs.readFileSync(path.join(userDataDir, "ai1-browser-zoom.json"), "utf8"));
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
  // The app reads these two only when AI1_E2E_BACKGROUND is 1. Playwright
  // gives the Electron process the environment of this process.
  downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3b-downloads-"));
  shellLog = path.join(downloadsDir, "..", `${path.basename(downloadsDir)}-shell.log`);
  process.env.AI1_E2E_DOWNLOADS_DIR = downloadsDir;
  process.env.AI1_E2E_SHELL_LOG = shellLog;
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
    delete process.env.AI1_E2E_DOWNLOADS_DIR;
    delete process.env.AI1_E2E_SHELL_LOG;
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(downloadsDir, { recursive: true, force: true });
    fs.rmSync(shellLog, { force: true });
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

test("Find in Page shows the match count, Enter goes to the next match, and Escape closes the bar", async () => {
  await openBrowserTab(app, `${fixture.url}apples`);
  await expect(mainTab("Apples")).toBeVisible();
  const findBar = app.page.locator(".ai1-browser:not(.lm-mod-hidden) .ai1-browser-find");
  const findInput = findBar.locator(".ai1-browser-find-input");
  const count = findBar.locator(".ai1-browser-find-count");
  await expect(findBar).toBeHidden();

  await app.quickCommandPalette.trigger("Browser: Find in Page");
  await expect(findInput).toBeFocused();
  // Monaco clears the `inQuickInput` context in a timer after the command
  // palette loses the focus. Until then, Theia gives Enter to the palette.
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await findInput.fill("apple");
  await expect(count).toHaveText("1 of 3");
  await findInput.press("Enter");
  await expect(count).toHaveText("2 of 3");
  await findInput.press("Shift+Enter");
  await expect(count).toHaveText("1 of 3");
  await findInput.fill("pear");
  await expect(count).toHaveText("No results");
  await findInput.fill("");
  await expect(count).toHaveText("");

  await findInput.press("Escape");
  await expect(findBar).toBeHidden();
});

test("the browser keybindings win while a browser tab has the focus, and do not run in other views", async () => {
  // Escape in the previous test gave the focus to the page. Keys on a
  // focused page do not go to the command palette.
  await app.page.locator("#theia-left-side-panel #files").click();
  await openBrowserTab(app, `${fixture.url}apples`);
  await expect(mainTab("Apples").and(app.page.locator(".lm-mod-current"))).toBeVisible();
  const browser = app.page.locator(".ai1-browser:not(.lm-mod-hidden)");
  const address = browser.locator(".ai1-browser-address");
  const findBar = browser.locator(".ai1-browser-find");
  const findInput = findBar.locator(".ai1-browser-find-input");
  const count = findBar.locator(".ai1-browser-find-count");
  const sourceControl = app.page.locator("#scm-view-container");
  await expect(sourceControl).toHaveCount(0);
  // The browser keybindings get their priority from context keys that are
  // local to the tab and to its find bar, not from the order of
  // registration.
  await expect(browser).toHaveAttribute("data-keybinding-context", /^\d+$/);
  await expect(findBar).toHaveAttribute("data-keybinding-context", /^\d+$/);

  await address.focus();
  await app.page.keyboard.press("Meta+KeyF");
  await expect(findInput).toBeFocused();
  await findInput.fill("apple");
  await expect(count).toHaveText("1 of 3");
  await app.page.keyboard.press("Meta+KeyG");
  await expect(count).toHaveText("2 of 3");
  await app.page.keyboard.press("Meta+Shift+KeyG");
  await expect(count).toHaveText("1 of 3");
  await expect(sourceControl).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  await expect(findBar).toBeHidden();

  await app.page.locator("#theia-left-side-panel #files").click();
  await app.page.keyboard.press("Meta+Shift+KeyG");
  await expect(sourceControl).toBeVisible();
  await expect(findBar).toBeHidden();
});

test("Zoom In zooms the page and keeps the level after a reload, and Reset Zoom removes the button", async () => {
  const index = await browserCount();
  await openBrowserTab(app, `${fixture.url}welcome`);
  await expect(mainTab("Welcome").and(app.page.locator(".lm-mod-current"))).toBeVisible();
  const zoomButton = activeBrowser().locator(".ai1-browser-zoom");
  await expect(zoomButton).toBeHidden();
  const before = await pageRatio(index);

  await app.quickCommandPalette.trigger("Browser: Zoom In");
  await expect(zoomButton).toHaveText("110%");
  await app.quickCommandPalette.trigger("Browser: Zoom In");
  await expect(zoomButton).toHaveText("125%");
  await expect.poll(() => pageRatio(index)).toBeCloseTo(before * 1.25, 5);
  const key = `default ${new URL(fixture.url).hostname}`;
  expect(zoomFile()).toEqual({ levels: { [key]: 125 } });

  await runInTab(index, "window.ai1BeforeReload = true");
  await activeBrowser().locator(".codicon-refresh").click();
  await expect.poll(() => runInTab(index, "window.ai1BeforeReload === undefined")).toBe(true);
  await expect.poll(() => pageRatio(index)).toBeCloseTo(before * 1.25, 5);
  await expect(zoomButton).toHaveText("125%");

  await app.quickCommandPalette.trigger("Browser: Reset Zoom");
  await expect(zoomButton).toBeHidden();
  await expect.poll(() => pageRatio(index)).toBeCloseTo(before, 5);
  expect(zoomFile()).toEqual({ levels: {} });
});

test("a zoom change applies to all tabs of the same profile and host name, also on another port, and not to another profile", async () => {
  const other = new BrowserFixtureServer();
  await other.start();
  try {
    const current = app.page.locator(".lm-mod-current");
    const agentIndex = await browserCount();
    await openBrowserTab(app, `${fixture.url}welcome`, "Agent");
    await expect(mainTab("Welcome").and(current)).toBeVisible();
    const otherPortIndex = agentIndex + 1;
    await openBrowserTab(app, `${other.url}apples`);
    const otherPortTab = mainTab("Apples").and(current);
    await expect(otherPortTab).toBeVisible();
    const otherPortTabId = await otherPortTab.getAttribute("id");
    const sameHostIndex = agentIndex + 2;
    await openBrowserTab(app, `${fixture.url}button`);
    const sameHostTab = mainTab("Button").and(current);
    await expect(sameHostTab).toBeVisible();
    const sameHostTabId = await sameHostTab.getAttribute("id");
    const zoomedIndex = agentIndex + 3;
    await openBrowserTab(app, `${fixture.url}welcome`);
    await expect(mainTab("Welcome").and(current)).toBeVisible();
    const base = await pageRatio(zoomedIndex);
    expect(await pageRatio(agentIndex)).toBeCloseTo(base, 5);
    expect(await pageRatio(otherPortIndex)).toBeCloseTo(base, 5);
    expect(await pageRatio(sameHostIndex)).toBeCloseTo(base, 5);

    await app.quickCommandPalette.trigger("Browser: Zoom Out");
    await expect(activeBrowser().locator(".ai1-browser-zoom")).toHaveText("90%");
    await expect.poll(() => pageRatio(zoomedIndex)).toBeCloseTo(base * 0.9, 5);
    await expect.poll(() => pageRatio(sameHostIndex)).toBeCloseTo(base * 0.9, 5);
    await expect.poll(() => pageRatio(otherPortIndex)).toBeCloseTo(base * 0.9, 5);
    expect(await pageRatio(agentIndex)).toBeCloseTo(base, 5);

    await clickTab(app.page.locator(`[id="${otherPortTabId}"]`));
    await expect(activeBrowser().locator(".ai1-browser-zoom")).toHaveText("90%");

    await clickTab(app.page.locator(`[id="${sameHostTabId}"]`));
    const sameHostButton = activeBrowser().locator(".ai1-browser-zoom");
    await expect(sameHostButton).toHaveText("90%");
    await expect.poll(() => pageRatio(sameHostIndex)).toBeCloseTo(base * 0.9, 5);
    await sameHostButton.click();
    await expect(sameHostButton).toBeHidden();
    await expect.poll(() => pageRatio(zoomedIndex)).toBeCloseTo(base, 5);
    await expect.poll(() => pageRatio(sameHostIndex)).toBeCloseTo(base, 5);
    await expect.poll(() => pageRatio(otherPortIndex)).toBeCloseTo(base, 5);
  } finally {
    await other.stop();
  }
});

test("the zoom keys zoom the browser tab and not the IDE while a browser tab has the focus, and zoom the IDE elsewhere", async () => {
  await openBrowserTab(app, `${fixture.url}start`);
  await expect(mainTab("Start").and(app.page.locator(".lm-mod-current"))).toBeVisible();
  const address = activeBrowser().locator(".ai1-browser-address");
  const zoomButton = activeBrowser().locator(".ai1-browser-zoom");
  const ide = await ideZoom();

  await address.focus();
  await app.page.keyboard.press("Meta+Equal");
  await expect(zoomButton).toHaveText("110%");
  await app.page.keyboard.press("Meta+Shift+Equal");
  await expect(zoomButton).toHaveText("125%");
  await app.page.keyboard.press("Meta+Minus");
  await expect(zoomButton).toHaveText("110%");
  await app.page.keyboard.press("Meta+Digit0");
  await expect(zoomButton).toBeHidden();

  await activeBrowser().locator("webview").focus();
  await app.page.keyboard.press("Meta+Equal");
  await expect(zoomButton).toHaveText("110%");
  await app.page.keyboard.press("Meta+Digit0");
  await expect(zoomButton).toBeHidden();
  expect(await ideZoom()).toEqual(ide);

  const explorer = await app.openView(TheiaExplorerView);
  await explorer.focus();
  await expect(app.page.locator(".ai1-browser :focus")).toHaveCount(0);
  await app.page.keyboard.press("Meta+Equal");
  await expect.poll(async () => (await ideZoom()).level).toBeGreaterThan(ide.level);
  await expect(zoomButton).toBeHidden();
  await app.page.keyboard.press("Meta+Digit0");
  await expect.poll(async () => (await ideZoom()).level).toBe(ide.level);
});

test("Set Viewport gives the page the iPhone 15 size with touch, and an agent connection clears it", async () => {
  const index = await browserCount();
  await openBrowserTab(app, `${fixture.url}responsive`);
  const tab = mainTab("Responsive").and(app.page.locator(".lm-mod-current"));
  await expect(tab).toBeVisible();
  const tabId = await tab.getAttribute("id");
  const givenTab = app.page.locator(`[id="${tabId}"]`);
  const browserNode = app.page.locator(".ai1-browser").nth(index);
  const viewportButton = browserNode.locator(".ai1-browser-viewport-button");
  const label = browserNode.locator(".ai1-browser-viewport-label");
  await expect(label).toBeHidden();

  await app.quickCommandPalette.trigger("Browser: Set Viewport…", "iPhone 15 (393 × 852)");
  await expect(label).toHaveText("393 × 852");
  await expect(viewportButton).toHaveAttribute("title", "Viewport: iPhone 15 (393 × 852)");
  // The page loads again with the new user agent.
  await expect.poll(() => runInTab<string>(index, "navigator.userAgent")).toContain("iPhone OS 17_0");
  await expect.poll(() => runInTab<number>(index, "window.innerWidth")).toBe(393);
  expect(await runInTab<number>(index, "navigator.maxTouchPoints")).toBeGreaterThan(0);

  await browserNode.locator(".ai1-browser-give-to-agent").click();
  await expect(givenTab).toHaveClass(/ai1-browser-agent-waiting/);
  const browser = await connectAgent();
  try {
    expect(pagesOf(browser)).toHaveLength(1);
    const page = pagesOf(browser)[0];
    await expect(page).toHaveTitle("Responsive");
    await expect(givenTab).toHaveClass(/ai1-browser-agent-connected/);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).not.toBe(393);
    await expect(viewportButton).toBeDisabled();
    await expect(viewportButton).toHaveAttribute("title", "Viewport: Responsive (off)");
    await expect(label).toBeHidden();
  } finally {
    await browser.close();
  }
  await expect(givenTab).not.toHaveClass(/ai1-browser-agent/);
  await expect(viewportButton).toBeEnabled();
  await expect(viewportButton).toHaveAttribute("title", "Viewport: Responsive (off)");
});

test("a download shows in the Downloads view, and Show in Finder goes to the stubbed shell", async () => {
  // Without it, the app would use the real Downloads folder and Finder.
  expect(process.env.AI1_E2E_BACKGROUND).toBe("1");
  await openBrowserTab(app, `${fixture.url}download.txt`);
  const saved = path.join(downloadsDir, "download.txt");
  await expect.poll(() => fs.existsSync(saved) && fs.readFileSync(saved, "utf8")).toBe(DOWNLOAD_TEXT);

  await clickTab(app.page.locator("#shell-tab-ai1-downloads"));
  const row = app.page.locator("#ai1-downloads .ai1-downloads-row", { hasText: "download.txt" });
  await expect(row).toHaveClass(/ai1-downloads-completed/);
  await expect(row.locator(".ai1-downloads-host")).toHaveText("127.0.0.1");
  await expect(row.locator(".ai1-downloads-agent")).toHaveCount(0);

  await row.locator(".ai1-downloads-show").click();
  await expect
    .poll(() =>
      fs.existsSync(shellLog)
        ? fs
            .readFileSync(shellLog, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
    )
    .toContainEqual({ action: "show", path: saved });

  const badge = app.page.locator("#shell-tab-ai1-downloads .theia-badge-decorator-sidebar");
  await expect(badge).toBeHidden();
});
