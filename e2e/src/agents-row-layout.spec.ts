import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { clickTab } from "./click-tab";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "..", "..", "applications", "electron");
let root: string;
let server: FakeOpenCodeServer;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-agent-layout-")));
  const workspace = path.join(root, "workspace");
  const state = path.join(root, "state");
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "opencode"), "#!/bin/sh\nexec /bin/cat\n", { mode: 0o755 });
  fs.writeFileSync(path.join(home, ".zshenv"), `export PATH="${bin}:$PATH"\n`);
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, "keyboard-panel.txt"), "Keyboard panel test\n");
  fs.mkdirSync(path.join(state, "opencode"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(
    path.join(root, "config", "settings.json"),
    JSON.stringify({ "ai1.agents.notifyOnBlocked": false, "ai1.welcome.startup": "never" }),
  );
  server = new FakeOpenCodeServer();
  await server.start();
  const titles = [
    "Monorail",
    "Staking Site",
    "Update PR 456 for new Railgun release",
    "Review session permissions",
    "New session",
    "Restore Kimi k3, GLP, Opus 5 support",
  ];
  const now = Date.now();
  server.sessions = Array.from({ length: 24 }, (_, index) => ({
    id: `layout_${index}`,
    title: titles[index] ?? `Review workspace changes ${index + 1}`,
    directory: workspace,
    model: { id: index % 2 ? "kimi-k3" : "gpt-6-sol", providerID: "test" },
    time: { created: now - 7200000, updated: now - index * 60000 },
    outcome: index === 2 ? "failed" : index === 4 ? undefined : "succeeded",
  }));
  for (const [index, directory] of ["api", "packages/api"].entries()) {
    fs.mkdirSync(path.join(workspace, directory), { recursive: true });
    server.sessions.push({
      id: `nested_${directory}`,
      title: `Session in ${directory}`,
      directory: path.join(workspace, directory),
      model: { id: "gpt-6-sol", providerID: "test" },
      time: { created: now, updated: now + 60000 - index * 1000 },
      outcome: "succeeded",
    });
  }
  server.active.add("layout_1");
  server.pending.add("layout_3");
  fs.writeFileSync(
    path.join(state, "opencode", "service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  electronApp = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [electronAppPath]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${electronAppPath}`,
      `--plugins=local-dir:${path.join(electronAppPath, "plugins")}`,
      `--user-data-dir=${path.join(root, "userdata")}`,
      `--electronUserData=${path.join(root, "userdata")}`,
      workspace,
    ],
    env: {
      ...process.env,
      HOME: home,
      ZDOTDIR: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: state,
      TMUX_TMPDIR: root,
      TMUX: "",
    },
  });
  const page = await electronApp.firstWindow();
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
  app = new TheiaApp(page, new TheiaWorkspace(), true);
  await electronApp.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () {
      (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu = this;
    };
  });
  await app.waitForShellAndInitialized();
  if (!(await page.locator("#ai1-agents").isVisible())) {
    await clickTab(page.locator("#shell-tab-ai1-agents"));
  }
  await expect(page.locator(".ai1-agents-card")).toHaveCount(24);
  const bounds = (await page.locator("#theia-right-side-panel").boundingBox())!;
  await page.mouse.move(bounds.x - 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 2 - (320 - bounds.width), bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
});

test.afterAll(async () => {
  await electronApp?.close();
  await server?.stop();
  if (root) spawnSync("tmux", ["-S", path.join(root, `tmux-${process.getuid!()}`, "default"), "kill-server"]);
  await removeTempDir(root);
});

test("Session context menus rename the clicked row and keep delete confirmation", async () => {
  const page = app.page;
  const row = page.locator("#ai1-agents .theia-TreeNode", { hasText: "Monorail" });
  await expect(page.locator("#theia-main-content-panel .xterm")).toHaveCount(0);
  await row.click({ button: "right" });
  const menuLabels = () =>
    electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu?.items.map(
        (item) => item.label,
      ),
    );
  const choose = async (label: string) => {
    await electronApp.evaluate(({ BrowserWindow }, name) => {
      const menu = (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu!;
      const item = menu.items.find((entry) => entry.label === name)!;
      item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
    }, label);
  };
  await expect.poll(menuLabels).toEqual(["Rename Session", "Open Terminal", "", "Delete Session"]);
  await expect(page.locator("#theia-main-content-panel .xterm")).toHaveCount(0);
  await choose("Rename Session");
  const input = page.locator(".dialogBlock input");
  await expect(input).toHaveValue("Monorail");
  await input.fill("   ");
  await expect(page.getByRole("button", { name: "Rename", exact: true })).toBeDisabled();
  await input.fill("Cancelled name");
  await page.keyboard.press("Escape");
  expect(server.requests.some((request) => request.startsWith("PATCH"))).toBe(false);
  await electronApp.evaluate(() => {
    (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu = undefined;
  });
  await row.click({ button: "right" });
  await expect.poll(menuLabels).toContain("Rename Session");
  await choose("Rename Session");
  await input.fill("  Renamed Monorail  ");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const renamed = page.locator("#ai1-agents .theia-TreeNode", { hasText: "Renamed Monorail" });
  await expect(renamed).toBeVisible();
  expect(server.sessions.find((session) => session.id === "layout_0")?.title).toBe("Renamed Monorail");
  expect(server.sessions.find((session) => session.id === "layout_1")?.title).toBe("Staking Site");
  await electronApp.evaluate(() => {
    (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu = undefined;
  });
  await renamed.click({ button: "right" });
  await expect.poll(menuLabels).toContain("Delete Session");
  await choose("Delete Session");
  await expect(page.locator(".dialogBlock")).toContainText("Renamed Monorail");
  await page.keyboard.press("Escape");
  expect(server.requests.some((request) => request.startsWith("DELETE"))).toBe(false);
});

test("Session context menus do not appear on directory rows", async () => {
  await electronApp.evaluate(() => {
    (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu = undefined;
  });
  const group = app.page.locator("#ai1-agents .ai1-agents-group").first();
  await group.click({ button: "right" });
  await expect
    .poll(() =>
      electronApp.evaluate(() =>
        Boolean((globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu),
      ),
    )
    .toBe(false);
});

test("Agents rows align status markers with titles and keep controls clear of the scrollbar", async () => {
  const testInfo = test.info();
  const panel = app.page.locator("#ai1-agents");
  await panel.screenshot({ path: testInfo.outputPath("agents-rows.png") });
  const measurements = await panel.evaluate((element) => {
    const rows = Array.from(element.querySelectorAll<HTMLElement>(".theia-TreeNode")).filter((row) =>
      row.querySelector(".ai1-agents-card"),
    );
    return rows.slice(0, 5).map((row) => {
      const status = row.querySelector<HTMLElement>(".ai1-agents-status")!;
      const title = row.querySelector<HTMLElement>(".ai1-agents-title")!;
      const a = status.getBoundingClientRect();
      const b = title.getBoundingClientRect();
      return {
        offset: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
        titleX: b.x,
        width: a.width,
      };
    });
  });
  for (const row of measurements) {
    expect(row.offset).toBeLessThanOrEqual(1);
    expect(row.titleX).toBeCloseTo(measurements[0].titleX, 0);
    expect(row.width).toBeGreaterThan(0);
  }
  await expect(panel.locator(".theia-tree-node-indent:visible")).toHaveCount(0);
  const done = panel.getByRole("img", { name: "Done", exact: true }).first();
  await expect(done).toBeVisible();
  const dotColor = await done.evaluate((node) => getComputedStyle(node, "::before").backgroundColor);
  expect(dotColor).not.toBe("rgba(0, 0, 0, 0)");
  const failedRow = panel.locator(".theia-TreeNode", { hasText: "Update PR 456" });
  await failedRow.hover();
  const button = failedRow.getByRole("button", { name: "Delete session", exact: true });
  const bounds = await button.boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds!.x + panelBounds!.width - bounds!.x - bounds!.width).toBeGreaterThanOrEqual(14);
  expect(bounds!.width).toBeGreaterThanOrEqual(22);
  expect(bounds!.height).toBeGreaterThanOrEqual(22);
});

test("Agents row buttons show hover and keyboard focus without activating the session", async () => {
  const testInfo = test.info();
  const row = app.page.locator("#ai1-agents .theia-TreeNode", { hasText: "Update PR 456" });
  await row.hover();
  const button = row.getByRole("button", { name: "Delete session", exact: true });
  await expect(button).toBeVisible();
  const before = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
  await button.hover();
  await expect.poll(() => button.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(before);
  await app.page.locator("#ai1-agents").screenshot({ path: testInfo.outputPath("agents-button-hover.png") });
  await button.focus();
  await app.page.keyboard.press("Shift+Tab");
  await expect(row.getByRole("button", { name: "Open terminal", exact: true })).toBeFocused();
  await app.page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("outline-style", "solid");
  await app.page.keyboard.press("Enter");
  await expect(app.page.locator(".dialogBlock")).toBeVisible();
  await app.page.keyboard.press("Escape");
  await expect(app.page.locator(".dialogBlock")).toHaveCount(0);
  await button.click();
  await expect(app.page.locator(".dialogBlock")).toBeVisible();
  await app.page.keyboard.press("Escape");
  await expect(app.page.locator(".dialogBlock")).toHaveCount(0);
  await expect(app.page.locator("#theia-main-content-panel .xterm")).toHaveCount(0);
  expect(server.requests.some((request) => request.startsWith("DELETE "))).toBe(false);
});

test("Agents rows keep actions inside a narrow panel in the light theme", async () => {
  fs.writeFileSync(
    path.join(root, "config", "settings.json"),
    JSON.stringify({ "ai1.agents.notifyOnBlocked": false, "workbench.colorTheme": "light" }),
  );
  await expect(app.page.locator("body")).toHaveClass(/theia-light/);
  const page = app.page;
  const panel = page.locator("#ai1-agents");
  const bounds = (await page.locator("#theia-right-side-panel").boundingBox())!;
  await page.mouse.move(bounds.x - 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 2 + bounds.width - 240, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThanOrEqual(245);
  const row = panel.locator(".theia-TreeNode", { hasText: "Update PR 456" });
  await row.hover();
  const button = row.getByRole("button", { name: "Delete session", exact: true });
  await button.hover();
  const buttonBounds = (await button.boundingBox())!;
  const panelBounds = (await panel.boundingBox())!;
  expect(panelBounds.x + panelBounds.width - buttonBounds.x - buttonBounds.width).toBeGreaterThanOrEqual(14);
  const titleBounds = (await row.locator(".ai1-agents-title").boundingBox())!;
  expect(titleBounds.width).toBeGreaterThan(60);
  expect(titleBounds.x + titleBounds.width).toBeLessThan(buttonBounds.x);
  expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await panel.screenshot({ path: test.info().outputPath("agents-narrow-light.png") });
});

test("Agents keeps the open directory first with separate collapsible path groups", async () => {
  const panel = app.page.locator("#ai1-agents");
  const names = panel.locator(".ai1-agents-name");
  await expect(names).toHaveText(["workspace", "workspace/api", "workspace/packages/api"]);
  const main = panel.locator(".theia-TreeNode", {
    has: app.page.getByText("workspace", { exact: true }),
  });
  const api = panel.locator(".theia-TreeNode", {
    has: app.page.getByText("workspace/api", { exact: true }),
  });
  await main.locator(".theia-ExpansionToggle").click();
  await api.locator(".theia-ExpansionToggle").click();
  await expect(panel.locator(".ai1-agents-title")).toHaveText(["Session in api"]);
  await expect(names).toHaveText(["workspace", "workspace/api", "workspace/packages/api"]);
  await app.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect
    .poll(() => server.requests.filter((request) => request === "GET /api/session").length)
    .toBeGreaterThan(1);
  await expect(panel.locator(".ai1-agents-title")).toHaveText(["Session in api"]);
  await main.locator(".theia-ExpansionToggle").click();
  await expect(panel.locator(".ai1-agents-card")).toHaveCount(25);
  await api.locator(".theia-ExpansionToggle").click();
  await expect(panel.locator(".ai1-agents-card")).toHaveCount(24);
  await expect(names.first()).toHaveText("workspace");
});

test("Open Terminal in the context menu opens the clicked session", async () => {
  const title = server.sessions.find((session) => session.id === "layout_0")!.title;
  await electronApp.evaluate(() => {
    (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu = undefined;
  });
  const row = app.page.locator("#ai1-agents .theia-TreeNode", { hasText: title });
  await row.click({ button: "right" });
  await expect
    .poll(() =>
      electronApp.evaluate(() =>
        (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu?.items.map(
          (item) => item.label,
        ),
      ),
    )
    .toContain("Open Terminal");
  await electronApp.evaluate(({ BrowserWindow }) => {
    const menu = (globalThis as typeof globalThis & { sessionMenu?: Electron.Menu }).sessionMenu!;
    menu.items
      .find((item) => item.label === "Open Terminal")!
      .click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  });
  await expect(app.page.locator("#theia-main-content-panel .xterm")).toHaveCount(1);
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: title }),
  ).toBeVisible();
});

test("Enter on an Agents session opens its terminal in the last focused center panel", async () => {
  const page = app.page;
  const initialTitle = server.sessions.find((session) => session.id === "layout_0")!.title;
  const initialTab = page.locator("#theia-main-content-panel .lm-TabBar-tab", {
    hasText: `sh · ${initialTitle}`,
  });
  if (await initialTab.count()) await initialTab.locator(".lm-TabBar-tabCloseIcon").click();
  await expect(page.locator("#theia-main-content-panel .xterm")).toHaveCount(0);
  await page.locator("#files .theia-TreeNode", { hasText: "keyboard-panel.txt" }).dblclick();
  await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
  await app.quickCommandPalette.type("Split Editor Right");
  await page.locator(".quick-input-widget .monaco-list-row", { hasText: "Split Editor Right" }).click();
  const bars = page.locator("#theia-main-content-panel .lm-TabBar");
  await expect(bars).toHaveCount(2);
  await page.keyboard.press("Meta+Control+2");
  await page.keyboard.press("Meta+Control+a");
  await expect
    .poll(() => page.locator("#ai1-agents").evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);
  const group = page.locator("#ai1-agents .theia-TreeNode", {
    has: page.getByText("workspace", { exact: true }),
  });
  await group.click();
  await expect(group).toHaveClass(/theia-mod-focus/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#ai1-agents .ai1-agents-card")).toHaveCount(24);
  const focused = page.locator("#ai1-agents .theia-TreeNode.theia-mod-focus .ai1-agents-title");
  await page.keyboard.press("ArrowDown");
  await expect(focused).toHaveCount(1);
  const title = await focused.innerText();
  await page.keyboard.press("Enter");
  await expect(bars.nth(1).locator(".lm-TabBar-tab", { hasText: `sh · ${title}` })).toBeVisible();
  await expect(bars.nth(0).locator(".lm-TabBar-tab", { hasText: `sh · ${title}` })).toHaveCount(0);
  await expect(page.locator("#theia-main-content-panel .xterm-helper-textarea:focus")).toHaveCount(1);
});
