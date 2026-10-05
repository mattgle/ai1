import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";
import { openBrowserTab } from "./open-browser-tab";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { clickTab } from "./click-tab";

let root: string;
let workspace: string;
let tmux: string;
let socket: string;
let server: FakeOpenCodeServer;
let running: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;
let browserFixture: BrowserFixtureServer;

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-terminal-folders-")));
  workspace = path.join(root, "code");
  for (const folder of [
    workspace,
    path.join(root, "home"),
    path.join(root, "config"),
    path.join(root, "state/opencode"),
    path.join(workspace, "railgun/tools with spaces"),
    path.join(workspace, "railgun/reloaded/packages"),
    path.join(workspace, "personal"),
  ]) {
    fs.mkdirSync(folder, { recursive: true });
  }
  execFileSync("git", ["init", path.join(workspace, "child-repo")], { stdio: "pipe" });
  execFileSync("git", ["init", path.join(workspace, "railgun/plane-mcp")], { stdio: "pipe" });
  fs.writeFileSync(path.join(workspace, "plain-file.txt"), "Not a folder\n");
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
  tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
  socket = path.join(root, `tmux-${process.getuid!()}`, "default");
  server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  browserFixture = new BrowserFixtureServer();
  await browserFixture.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  running = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${application}`,
      `--user-data-dir=${root}/userdata`,
      `--electronUserData=${root}/userdata`,
      workspace,
    ],
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      ZDOTDIR: path.join(root, "home"),
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
      TMUX_TMPDIR: root,
      TMUX: "",
    },
  });
  app = new TheiaApp(await running.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  await running.evaluate(({ dialog }) => {
    const state = globalThis as typeof globalThis & {
      folderChoice?: string | null;
      folderDialogOptions?: Electron.OpenDialogOptions;
    };
    dialog.showOpenDialog = async (...args: unknown[]) => {
      state.folderDialogOptions = args[args.length - 1] as Electron.OpenDialogOptions;
      return { canceled: !state.folderChoice, filePaths: state.folderChoice ? [state.folderChoice] : [] };
    };
  });
});

test.afterAll(async () => {
  await running?.close();
  await server?.stop();
  await browserFixture?.stop();
  if (tmux && socket) spawnSync(tmux, ["-S", socket, "kill-server"]);
  if (root) await removeTempDir(root);
});

async function openPicker(): Promise<void> {
  const terminal = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh ·" }).last();
  if (await terminal.count()) await clickTab(terminal);
  await app.page.keyboard.press(process.platform === "darwin" ? "Meta+t" : "Control+t");
  await expect(
    app.page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
  ).toBeFocused();
}

test("terminal picker includes non-Git parent folders such as railgun", async () => {
  await openPicker();
  const rows = app.page.locator(".quick-input-widget .monaco-list-row");
  await expect(rows.getByText("./ · code", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun", { exact: true })).toBeVisible();
  await expect(rows.getByText("personal", { exact: true })).toBeVisible();
  await expect(rows.getByText("child-repo", { exact: true })).toBeVisible();
  await expect(rows.getByText("plain-file.txt", { exact: true })).toHaveCount(0);
  await expect(rows.getByText("Browse…", { exact: true })).toBeVisible();
  await app.page.keyboard.press("Escape");
});

test("typing a folder path lists and filters its subfolders", async () => {
  await openPicker();
  const input = app.page.getByRole("textbox", { name: "New persistent terminal in", exact: true });
  const rows = app.page.locator(".quick-input-widget .monaco-list-row");
  await input.fill("railgun/");
  await expect(rows.getByText("railgun/reloaded", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/plane-mcp", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/tools with spaces", { exact: true })).toBeVisible();
  await input.fill("railgun/re");
  await expect(rows.getByText("railgun/reloaded", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/plane-mcp", { exact: true })).toHaveCount(0);
  await input.fill("railgun/reloaded/");
  await expect(rows.getByText("railgun/reloaded/packages", { exact: true })).toBeVisible();
  await input.fill("");
  await expect(rows.getByText("railgun", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/reloaded/packages", { exact: true })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
});

test("a typed nested path opens the shell in the selected folder", async () => {
  await openPicker();
  await app.page
    .getByRole("textbox", { name: "New persistent terminal in", exact: true })
    .fill("railgun/reloaded");
  await expect(
    app.page.locator(".quick-input-widget").getByText("railgun/reloaded", { exact: true }),
  ).toBeVisible();
  await app.page.keyboard.press("Enter");
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · reloaded" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      execFileSync(tmux, ["-S", socket, "list-panes", "-a", "-F", "#{pane_current_path}"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n"),
    )
    .toContain(path.join(workspace, "railgun/reloaded"));
});

test("unknown paths and rapid edits do not retain stale folder choices", async () => {
  await openPicker();
  const input = app.page.getByRole("textbox", { name: "New persistent terminal in", exact: true });
  const rows = app.page.locator(".quick-input-widget .monaco-list-row");
  await input.fill("railgun/");
  await input.fill("missing-folder/");
  await expect(rows.getByText("Browse…", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/reloaded", { exact: true })).toHaveCount(0);
  await input.fill("railgun/reloaded/");
  await input.fill("railgun/");
  await expect(rows.getByText("railgun/reloaded", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun/reloaded/packages", { exact: true })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
});

test("Browse opens a nested folder with spaces through a folder-only dialog", async () => {
  const target = path.join(workspace, "railgun/tools with spaces");
  await running.evaluate((_electron, selected) => {
    (globalThis as typeof globalThis & { folderChoice?: string | null }).folderChoice = selected;
  }, target);
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("Browse…", { exact: true }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · tools with spaces" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      execFileSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_path}"], { encoding: "utf8" })
        .trim()
        .split("\n"),
    )
    .toContain(target);
  const options = await running.evaluate(
    () =>
      (globalThis as typeof globalThis & { folderDialogOptions?: Electron.OpenDialogOptions })
        .folderDialogOptions,
  );
  expect(options?.properties).toContain("openDirectory");
  expect(options?.properties).not.toContain("openFile");
  expect(options?.properties).not.toContain("multiSelections");
  expect(options?.defaultPath).toBe(workspace);
});

test("canceling the picker or Browse does not open a terminal", async () => {
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh ·" });
  const before = await tabs.count();
  await openPicker();
  await app.page.keyboard.press("Escape");
  await expect(app.page.locator(".quick-input-widget")).toBeHidden();
  await expect(tabs).toHaveCount(before);
  await running.evaluate(() => {
    (globalThis as typeof globalThis & { folderChoice?: string | null }).folderChoice = null;
  });
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("Browse…", { exact: true }).click();
  await expect(app.page.locator(".quick-input-widget")).toBeHidden();
  await expect(tabs).toHaveCount(before);
});

test("selecting railgun starts the persistent shell in that exact folder", async () => {
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("railgun", { exact: true }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · railgun" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      execFileSync(tmux, ["-S", socket, "list-panes", "-a", "-F", "#{pane_current_path}"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n"),
    )
    .toContain(path.join(workspace, "railgun"));
});

test("agent creation keeps its separate Git repository choices", async () => {
  await app.quickCommandPalette.type("Agents: New Session");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "New Session" }).click();
  await expect(app.page.getByRole("textbox", { name: "New session in", exact: true })).toBeFocused();
  const rows = app.page.locator(".quick-input-widget .monaco-list-row");
  await expect(rows.getByText("child-repo", { exact: true })).toBeVisible();
  await expect(rows.getByText("railgun", { exact: true })).toHaveCount(0);
  await expect(rows.getByText("Browse…", { exact: true })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
});

test("Close All Tabs restores terminals, editors, and browser tabs as one batch", async () => {
  const terminalTabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh ·" });
  const initialTerminalCount = await terminalTabs.count();
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("railgun", { exact: true }).click();
  await expect(terminalTabs).toHaveCount(initialTerminalCount + 1);
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · railgun" }).last(),
  ).toBeVisible();
  await expect
    .poll(() => spawnSync(tmux, ["-S", socket, "list-panes", "-a"], { encoding: "utf8" }).status)
    .toBe(0);
  const terminalCount = await terminalTabs.count();
  await app.page.keyboard.press(process.platform === "darwin" ? "Meta+d" : "Control+d");
  await expect(terminalTabs).toHaveCount(terminalCount + 1);
  const sessions = () =>
    execFileSync(tmux, ["-S", socket, "list-panes", "-a", "-F", "#{session_name}:#{pane_pid}"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .sort();
  await expect.poll(() => sessions().length).toBe(terminalCount + 1);
  const beforeSessions = sessions();
  await app.page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
  await app.page.locator(".quick-input-widget input").fill("plain-file.txt");
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "plain-file.txt" })
    .first()
    .click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "plain-file.txt" }),
  ).toBeVisible();
  await openBrowserTab(app, `${browserFixture.url}welcome`);
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "Welcome" }),
  ).toBeVisible();
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab");
  const labels = await tabs.locator(".lm-TabBar-tabLabel").allTextContents();
  const panelCount = await app.page.locator("#theia-main-content-panel .lm-TabBar").count();
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await app.page.keyboard.press(`${modifier}+k`);
  await app.page.keyboard.press(`${modifier}+w`);
  await expect(tabs).toHaveCount(0);
  expect(sessions()).toEqual(beforeSessions);
  await app.page.keyboard.press(`${modifier}+Shift+t`);
  await expect(tabs.locator(".lm-TabBar-tabLabel")).toHaveText(labels);
  await expect(app.page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(panelCount);
  await expect(app.page.locator(".ai1-browser-address")).toHaveValue(`${browserFixture.url}welcome`);
  expect(sessions()).toEqual(beforeSessions);
});

test("reopening a closed batch keeps tabs opened after Close All Tabs", async () => {
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab");
  const initialCount = await tabs.count();
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("railgun", { exact: true }).click();
  await expect(tabs).toHaveCount(initialCount + 1);
  await expect(tabs.filter({ hasText: "sh · railgun" }).last()).toBeVisible();
  await expect(app.page.locator(".terminal-container:visible .xterm-helper-textarea").last()).toBeFocused();
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const count = await tabs.count();
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await app.page.keyboard.press(`${modifier}+k`);
  await app.page.keyboard.press(`${modifier}+w`);
  await expect(tabs).toHaveCount(0);
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("personal", { exact: true }).click();
  await expect(tabs).toHaveCount(1);
  await expect(app.page.locator(".terminal-container:visible .xterm-helper-textarea")).toBeFocused();
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await app.page.keyboard.press(`${modifier}+Shift+t`);
  await expect(tabs).toHaveCount(count + 1);
  await expect(tabs.filter({ hasText: "sh · personal" })).toBeVisible();
});

test("terminal normal text uses the regular JetBrains font face", async () => {
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("railgun", { exact: true }).click();
  const terminal = app.page.locator("#theia-main-content-panel .terminal-container:visible").last();
  const measure = terminal.locator(".xterm-char-measure-element");
  await expect(measure).toHaveCSS("font-size", "13px");
  await expect(measure).toHaveCSS("font-weight", "400");
  await terminal.evaluate((node) => {
    const sample = document.createElement("span");
    sample.id = "ai1-terminal-font-probe";
    sample.textContent = "Regular terminal text";
    const style = getComputedStyle(node.querySelector(".xterm-char-measure-element")!);
    sample.style.fontFamily = style.fontFamily;
    sample.style.fontSize = style.fontSize;
    sample.style.fontWeight = style.fontWeight;
    sample.style.fontStyle = style.fontStyle;
    document.body.appendChild(sample);
  });
  const cdp = await app.page.context().newCDPSession(app.page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root: documentNode } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: documentNode.nodeId,
      selector: "#ai1-terminal-font-probe",
    });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    console.log("Terminal font faces:", fonts);
    expect(
      fonts.some((font) => /JetBrains/i.test(font.familyName) && /Regular/i.test(font.postScriptName)),
    ).toBe(true);
  } finally {
    await cdp.detach();
    await app.page.locator("#ai1-terminal-font-probe").evaluate((node) => node.remove());
  }
  const config = path.join(root, "config/settings.json");
  const original = fs.readFileSync(config, "utf8");
  try {
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(original), "terminal.integrated.fontSize": 20 }));
    await expect(measure).toHaveCSS("font-size", "20px");
  } finally {
    fs.writeFileSync(config, original);
  }
  await expect(measure).toHaveCSS("font-size", "13px");
});

test("terminal appearance controls save live preferences and preserve unrelated settings", async () => {
  await openPicker();
  await app.page.locator(".quick-input-widget").getByText("personal", { exact: true }).click();
  await expect(app.page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
  const terminalId = await app.page
    .locator(".xterm-helper-textarea:focus")
    .evaluate((node) => node.closest(".terminal-container")!.id);
  const measure = app.page.locator(`[id="${terminalId}"] .xterm-char-measure-element`);
  const config = path.join(root, "config/settings.json");
  const original = fs.readFileSync(config, "utf8");
  const saved = () => JSON.parse(fs.readFileSync(config, "utf8"));
  fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(original), "editor.tabSize": 2 }));
  const openSetting = async (label: string) => {
    await app.quickCommandPalette.trigger("Terminal: Appearance…");
    await expect(
      app.page.getByRole("textbox", { name: "Terminal appearance · App profile", exact: true }),
    ).toBeFocused();
    await app.page.locator(".quick-input-widget").getByText(label, { exact: true }).click();
  };
  try {
    await openSetting("Font size");
    const input = app.page.getByRole("textbox", { name: "Terminal font size", exact: true });
    await input.fill("5");
    await input.press("Enter");
    await expect(input).toBeVisible();
    await input.fill("15");
    await input.press("Enter");
    await expect(measure).toHaveCSS("font-size", "15px");
    await openSetting("Font size");
    await input.fill("30");
    await input.press("Escape");
    await expect(measure).toHaveCSS("font-size", "15px");
    await openSetting("Normal text weight");
    await app.page.locator(".quick-input-widget").getByText("400", { exact: true }).click();
    await expect.poll(() => saved()["terminal.integrated.fontWeight"]).toBe("400");
    await openSetting("Bold ANSI colors");
    await app.page.locator(".quick-input-widget").getByText("Normal colors", { exact: true }).click();
    await expect.poll(() => saved()["terminal.integrated.drawBoldTextInBrightColors"]).toBe(false);
    await openSetting("Palette");
    await app.page.locator(".quick-input-widget").getByText("Editor theme", { exact: true }).click();
    await expect.poll(() => saved()["ai1.terminal.appearance"]).toBe("theme");
    await openSetting("Restore terminal defaults");
    await app.page
      .locator(".quick-input-widget")
      .getByText("Restore terminal defaults", { exact: true })
      .click();
    await expect(measure).toHaveCSS("font-size", "13px");
    expect(saved()["editor.tabSize"]).toBe(2);
    expect(saved()["ai1.welcome.startup"]).toBe("never");
    for (const key of [
      "terminal.integrated.fontSize",
      "terminal.integrated.fontFamily",
      "terminal.integrated.fontWeight",
      "terminal.integrated.fontWeightBold",
      "terminal.integrated.drawBoldTextInBrightColors",
      "ai1.terminal.appearance",
      "ai1.terminal.colorOverrides",
    ]) {
      await expect.poll(() => saved()[key]).toBeUndefined();
    }
  } finally {
    fs.writeFileSync(config, original);
  }
});
