import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

test("Welcome opens once per profile and supports manual, always, and never opening", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-welcome-")));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(root, "config"));
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  const server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const launch = async (folder = workspace) => {
    running = await electron.launch({
      executablePath: process.env.AI1_E2E_EXECUTABLE,
      args: [
        ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
        "--no-sandbox",
        "--no-cluster",
        `--app-project-path=${application}`,
        `--user-data-dir=${root}/userdata`,
        `--electronUserData=${root}/userdata`,
        folder,
      ],
      env: {
        ...process.env,
        THEIA_CONFIG_DIR: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
      },
    });
    const page = await running.firstWindow();
    const app = new TheiaApp(page, new TheiaWorkspace(), true);
    await app.waitForShellAndInitialized();
    return app;
  };
  const quit = async () => {
    const closed = running!.waitForEvent("close");
    await running!.evaluate(({ app }) => app.quit());
    await closed;
    running = undefined;
  };
  try {
    let app = await launch();
    await expect(app.page.locator("#ai1-welcome h1")).toHaveText("Welcome to AI1");
    await expect(app.page.locator("#ai1-welcome")).toContainText("Cmd+Control+0");
    await expect(app.page.locator("#ai1-welcome")).toContainText("Escape, Escape");
    for (const [id, label, keys] of [
      ["explorer-view-container", "Explorer", /Shift.*E/],
      ["search-view-container", "Search", /Shift.*F/],
      ["vsx-extensions-view-container", "Extensions", /Shift.*X/],
      ["ai1-agents", "Agents", /Ctrl.*A/],
      ["ai1-changes", "Changes", /Ctrl.*C/],
    ] as const) {
      await app.page.locator(`#shell-tab-${id}`).hover();
      await expect(app.page.locator(".theia-hover")).toContainText(label);
      await expect(app.page.locator(".theia-hover")).toContainText(keys);
      await app.page.mouse.move(0, 0);
    }
    fs.writeFileSync(
      path.join(root, "config/keymaps.json"),
      JSON.stringify([{ command: "ai1.agents.focus", keybinding: "meta+alt+a" }]),
    );
    await expect
      .poll(async () => {
        await app.page.keyboard.press("Meta+Alt+a");
        return app.page.locator("#ai1-agents").evaluate((node) => node.contains(document.activeElement));
      })
      .toBe(true);
    await app.page.locator("#shell-tab-ai1-agents").hover();
    await expect(app.page.locator(".theia-hover")).toContainText("Cmd+Alt+A");
    await app.page.mouse.move(0, 0);
    await app.page.locator("#shell-tab-ai1-welcome .lm-TabBar-tabCloseIcon").click();
    await expect(app.page.locator("#ai1-welcome")).toHaveCount(0);
    await quit();
    const otherWorkspace = path.join(root, "other-workspace");
    fs.mkdirSync(otherWorkspace);
    app = await launch(otherWorkspace);
    await expect(app.page.locator("#ai1-welcome")).toHaveCount(0);
    await app.quickCommandPalette.type("Welcome to AI1");
    await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Welcome to AI1" }).click();
    await expect(app.page.locator("#ai1-welcome")).toBeVisible();
    await app.page.getByRole("button", { name: "Open Changes", exact: true }).click();
    await expect
      .poll(() => app.page.locator("#ai1-changes").evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    await app.page.keyboard.press("Meta+Control+0");
    await expect
      .poll(() => app.page.locator("#ai1-welcome").evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    await app.page.keyboard.press("Meta+Control+b");
    await expect(app.page.locator(".ai1-browser-address:focus")).toHaveCount(1);
    await quit();
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "always" }),
    );
    app = await launch();
    await expect(app.page.locator("#ai1-welcome")).toBeVisible();
    await app.page.locator("#shell-tab-ai1-welcome .lm-TabBar-tabCloseIcon").click();
    await quit();
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "never" }),
    );
    app = await launch();
    await expect(app.page.locator("#ai1-welcome")).toHaveCount(0);
  } finally {
    await running?.close();
    await server.stop();
    await removeTempDir(root);
  }
});
