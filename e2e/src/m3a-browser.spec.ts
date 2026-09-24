import { ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer, makeLocalCertificate } from "./browser-fixture-server";
import { clickTab } from "./click-tab";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;
let fixture: BrowserFixtureServer;
let secureFixture: BrowserFixtureServer;
let agentPort: number;
let portsBadgeServer: ChildProcess;

function mainTab(text: string) {
  return app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: text });
}

async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function openTab(url: string, profileName?: string): Promise<void> {
  await openBrowserTab(app, url, profileName);
}

test.beforeAll(async ({ playwright, browser }) => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  agentPort = await freePort();
  fs.writeFileSync(
    path.join(configDir, "settings.json"),
    JSON.stringify({ "ai1.browser.agentAddress.enabled": true, "ai1.browser.agentAddress.port": agentPort }),
  );
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  // Listens in `dirty-repo` before the app starts, so the Ports view's one
  // scan at start-up (before anyone opens the Ports tab) already finds it.
  portsBadgeServer = spawn(
    process.execPath,
    [
      "-e",
      "require('http').createServer((q, s) => s.end('ok')).listen(0, '127.0.0.1', () => process.stdout.write('ready'))",
    ],
    { cwd: path.join(workspace.path, "dirty-repo"), stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((resolve) => portsBadgeServer.stdout!.once("data", () => resolve()));
  fixture = new BrowserFixtureServer();
  await fixture.start();
  secureFixture = new BrowserFixtureServer(makeLocalCertificate(configDir));
  await secureFixture.start();
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
    portsBadgeServer.kill();
    await fixture.stop();
    await secureFixture.stop();
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

test("a local page with an untrusted certificate offers Continue, also after a profile change", async () => {
  await openTab(`${secureFixture.url}secure`);
  const tab = app.page.locator(".ai1-browser:not(.lm-mod-hidden)");
  await expect(tab.locator(".ai1-browser-continue")).toBeVisible();
  await expect(tab.locator(".ai1-browser-retry")).toHaveCount(0);
  // A new profile makes a new `<webview>` that loads the page from its `src`.
  await tab.locator(".ai1-browser-profile").selectOption("agent");
  await expect(tab.locator(".ai1-browser-continue")).toBeVisible();
  await expect(tab.locator(".ai1-browser-retry")).toHaveCount(0);
  await tab.locator(".ai1-browser-continue").click();
  await expect(mainTab("Secure page")).toBeVisible();
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

test("a tab does not load a local file, also when the navigation does not come from the page", async () => {
  await openTab(`${fixture.url}welcome`);
  const currentUrl = () =>
    app.page.evaluate(() =>
      (
        document.querySelector(".ai1-browser:not(.lm-mod-hidden) webview") as unknown as { getURL(): string }
      ).getURL(),
    );
  await expect.poll(currentUrl).toBe(`${fixture.url}welcome`);
  // `loadURL` starts the navigation in the browser, so `will-navigate` does
  // not see it.
  await app.page.evaluate(() =>
    (
      document.querySelector(".ai1-browser:not(.lm-mod-hidden) webview") as unknown as {
        loadURL(url: string): Promise<void>;
      }
    )
      .loadURL("file:///etc/hosts")
      .catch(() => undefined),
  );
  await expect.poll(currentUrl).toBe("about:blank");
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
  await expect(mainTab("Button")).toBeVisible();
  const settings = fs.readFileSync(path.join(configDir, "settings.json"), "utf8");
  expect(JSON.parse(settings)["ai1.browser.openLinksIn"]).toBe("ai1");
});

test("the Ports tab shows a badge at start, before anyone opens it", async () => {
  const badge = app.page.locator("#shell-tab-ai1-ports .theia-badge-decorator-sidebar");
  await expect(badge).toHaveText("1", { timeout: 15_000 });
});

test("the Ports view lists a server under its repository and opens it", async () => {
  const dirtyRepo = path.join(app.workspace.path, "dirty-repo");
  // `process.stdout.write` (not `console.log`) prints the port with no color
  // codes: Playwright sets `FORCE_COLOR` in its own process, and a child
  // process inherits it, so `console.log` of a number would add them even
  // though stdout is a pipe, not a terminal.
  const server: ChildProcess = spawn(
    process.execPath,
    [
      "-e",
      "require('http').createServer((q, s) => s.end('<title>From dirty-repo</title>')).listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port)) })",
    ],
    { cwd: dirtyRepo, stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    const port = await new Promise<string>((resolve) =>
      server.stdout!.once("data", (data) => resolve(String(data).trim())),
    );
    await clickTab(app.page.locator("#shell-tab-ai1-ports"));
    const group = app.page.locator(".ai1-ports-group", { hasText: "dirty-repo" });
    const row = group.locator(".ai1-ports-row", { hasText: `:${port}` });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(mainTab("From dirty-repo")).toBeVisible();
  } finally {
    server.kill();
  }
});

test("the agent address refuses a wrong secret", async () => {
  const response = await fetch(`http://127.0.0.1:${agentPort}/${"x".repeat(43)}/json/version`);
  expect(response.status).toBe(404);
});

test("Playwright controls the agent tab through the agent address, and sees only that page", async () => {
  // The secret of this run is in its own temporary user data folder.
  const secret = fs.readFileSync(path.join(userDataDir, "ai1-browser-agent-secret"), "utf8").trim();
  const agentTab = app.page.locator("#theia-main-content-panel .lm-TabBar-tab.ai1-browser-agent-tab");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${agentPort}/${secret}/`);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    expect(pages).toHaveLength(1);
    const page = pages[0];
    await page.goto(`${fixture.url}button`);
    await page.click("#go");
    await expect(mainTab("Clicked")).toBeVisible();
    await expect(mainTab("Clicked")).toHaveClass(/ai1-browser-agent-connected/);
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(1000);
    await page.goto(`${fixture.url}form`);
    await expect(page).toHaveTitle("Welcome");
    // The agent cannot open a local file.
    await expect(page.goto("file:///etc/hosts")).rejects.toThrow(/only http and https/);
    await expect(page).toHaveTitle("Welcome");
    await expect(agentTab).toHaveText(/Welcome/);
    // A new connection replaces the old one and gets the same page.
    const second = await chromium.connectOverCDP(`http://127.0.0.1:${agentPort}/${secret}/`);
    try {
      await expect.poll(() => browser.isConnected()).toBe(false);
      const pagesAgain = second.contexts().flatMap((context) => context.pages());
      expect(pagesAgain).toHaveLength(1);
      await expect(pagesAgain[0]).toHaveTitle("Welcome");
      await expect(agentTab).toHaveClass(/ai1-browser-agent-connected/);
    } finally {
      await second.close();
    }
  } finally {
    await browser.close();
  }
  // The agent tab stays open and keeps its mark, without the connected mark.
  await expect(agentTab).toHaveText(/Welcome/);
  await expect(agentTab).not.toHaveClass(/ai1-browser-agent-connected/);
});
