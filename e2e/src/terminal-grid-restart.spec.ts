import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

test("A window restart keeps the terminal split grid and pane sizes", async () => {
  test.setTimeout(180_000);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-terminal-grid-")));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  const server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
  const socket = path.join(root, `tmux-${process.getuid!()}`, "default");
  let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const launch = async () => {
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "never" }),
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
        THEIA_CONFIG_DIR: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
        TMUX_TMPDIR: root,
        TMUX: "",
      },
    });
    const page = await running.firstWindow();
    await running.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
    const app = new TheiaApp(page, new TheiaWorkspace(), true);
    await app.waitForShellAndInitialized();
    return app;
  };
  const command = async (app: TheiaApp, name: string) => {
    await app.quickCommandPalette.type(name);
    await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: name }).click();
  };
  const grid = (app: TheiaApp) =>
    app.page.locator("#theia-main-content-panel .lm-TabBar").evaluateAll((bars) =>
      bars
        .map((bar) => {
          const bounds = bar.getBoundingClientRect();
          return {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            tabs: Array.from(bar.querySelectorAll(".lm-TabBar-tab")).map((tab) => tab.id),
            activeTab: bar.querySelector(".lm-mod-current")?.id,
          };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x),
    );
  try {
    const first = await launch();
    await command(first, "New Persistent Terminal");
    await expect(
      first.page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
    ).toBeFocused();
    await expect(first.page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText(
      "workspace",
    );
    await first.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await first.page.keyboard.press("Enter");
    await expect(first.page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
    await command(first, "Split Terminal Right");
    await expect(first.page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(2);
    await command(first, "Split Terminal Down");
    await expect(first.page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(3);
    await first.page.keyboard.press("Meta+Control+ArrowLeft");
    await first.page.keyboard.press("Meta+t");
    await expect(
      first.page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
    ).toBeFocused();
    await expect(first.page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText(
      "workspace",
    );
    await first.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await first.page.keyboard.press("Enter");
    await expect(
      first.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }),
    ).toHaveCount(4);
    const before = await grid(first);
    await Promise.all([running!.waitForEvent("close"), running!.evaluate(({ app }) => app.quit())]);
    running = undefined;
    const second = await launch();
    await expect(
      second.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }),
    ).toHaveCount(4);
    await expect(second.page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(3);
    await expect.poll(() => grid(second)).toEqual(before);
    const input = second.page.locator(".xterm-helper-textarea:visible").last();
    await input.click();
    await input.fill("echo AI1_GRID_RESTORE_MARKER");
    await input.press("Enter");
    await expect
      .poll(() =>
        execFileSync(tmux, ["-S", socket, "capture-pane", "-p", "-t", "ai1-4"], { encoding: "utf8" }),
      )
      .toContain("AI1_GRID_RESTORE_MARKER");
    await Promise.all([running!.waitForEvent("close"), running!.evaluate(({ app }) => app.quit())]);
    running = undefined;
    const third = await launch();
    await expect(third.page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(3);
    await expect.poll(() => grid(third)).toEqual(before);
  } finally {
    await running?.close();
    await server.stop();
    spawnSync(tmux, ["-S", socket, "kill-server"]);
    await removeTempDir(root);
  }
});
