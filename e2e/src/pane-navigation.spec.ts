import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

test("Number shortcuts select terminal rows and columns instead of tabs", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-pane-navigation-")));
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
  try {
    const application = path.resolve(__dirname, "../../applications/electron");
    running = await electron.launch({
      args: [
        application,
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
    const app = new TheiaApp(page, new TheiaWorkspace(), true);
    await app.waitForShellAndInitialized();
    await page.keyboard.press("Meta+t");
    await expect(
      page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText("workspace");
    await page.keyboard.press("Enter");
    const focusedId = () =>
      page
        .locator("#theia-main-content-panel .terminal-container", {
          has: page.locator(".xterm-helper-textarea:focus"),
        })
        .getAttribute("id");
    await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
    const top = await focusedId();
    await page.keyboard.press("Meta+Shift+d");
    await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(2);
    const bottomLeft = await focusedId();
    await page.keyboard.press("Meta+d");
    await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(3);
    const bottomRight = await focusedId();
    expect(new Set([top, bottomLeft, bottomRight]).size).toBe(3);
    for (const [keys, target] of [
      ["Meta+Shift+1", top],
      ["Meta+Shift+2", bottomLeft],
      ["Meta+2", bottomRight],
      ["Meta+1", bottomLeft],
      ["Meta+Shift+1", top],
      ["Meta+2", top],
    ]) {
      await page.keyboard.press(keys!);
      await expect.poll(focusedId).toBe(target);
      await expect(page.locator(".quick-input-widget")).toBeHidden();
    }
  } finally {
    await running?.close();
    await server.stop();
    spawnSync(tmux, ["-S", socket, "kill-server"]);
    await removeTempDir(root);
  }
});
