import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, expect, test, type Browser } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("ai1 opens terminal directories when the packaged app is closed and already running", async () => {
  test.skip(process.platform !== "darwin" || !process.env.AI1_E2E_EXECUTABLE, "Requires the macOS package.");
  const temporary = path.join(os.tmpdir(), "opencode");
  fs.mkdirSync(temporary, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(temporary, "ai1-cli-workspace-")));
  const workspace = path.join(root, "terminal directory");
  const nested = path.join(workspace, "src/app with spaces");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(workspace, "first-workspace.md"), "# First workspace\n");
  fs.writeFileSync(path.join(nested, "second-workspace.md"), "# Second workspace\n");
  fs.mkdirSync(path.join(root, "config"));
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
  const server = new FakeOpenCodeServer();
  server.sessions = [];
  let browser: Browser | undefined;
  const pidFile = path.join(root, "pids");
  const pids = () =>
    fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8").trim().split("\n").map(Number) : [];
  try {
    await server.start();
    fs.writeFileSync(
      path.join(root, "state/opencode/service.json"),
      JSON.stringify({ url: server.baseUrl, password: server.password }),
    );
    const application = process.env.AI1_PACKAGED_RESOURCES!;
    const testApp = path.join(root, "AI1 fixture.app");
    const executable = path.join(testApp, "Contents/MacOS/AI1");
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    // The shim adds test-only profile and debug options to the real packaged executable.
    fs.writeFileSync(
      executable,
      [
        "#!/bin/sh",
        `echo $$ >> ${quote(pidFile)}`,
        `exec ${quote(process.env.AI1_E2E_EXECUTABLE!)} --no-sandbox --no-cluster --remote-debugging-port=0 ${quote(`--app-project-path=${application}`)} ${quote(`--user-data-dir=${root}/userdata`)} ${quote(`--electronUserData=${root}/userdata`)} "$@" 2>> ${quote(path.join(root, "electron.log"))}`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const bin = path.join(root, "bin");
    execFileSync(process.execPath, [
      path.resolve(__dirname, "../../scripts/install-cli.mjs"),
      "--app",
      testApp,
      "--bin",
      bin,
    ]);
    const env = {
      ...process.env,
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
      TMUX_TMPDIR: root,
      TMUX: "",
      AI1_E2E_BACKGROUND: "1",
      THEIA_ELECTRON_NO_EARLY_WINDOW: "1",
    };
    const open = (directory: string) =>
      execFileSync(path.join(bin, "ai1"), [directory], { cwd: workspace, env, timeout: 5000 });
    open(".");
    const portFile = path.join(root, "userdata/DevToolsActivePort");
    await expect.poll(() => fs.existsSync(portFile)).toBe(true);
    const port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const pages = () =>
      browser!
        .contexts()
        .flatMap((context) => context.pages())
        .filter((page) => page.url().includes("index.html"));
    await expect.poll(() => pages().length).toBe(1);
    const first = pages()[0];
    await new TheiaApp(first, new TheiaWorkspace(), true).waitForShellAndInitialized();
    await expect(first.locator("#files .theia-TreeNode", { hasText: "first-workspace.md" })).toBeVisible();

    open("src/app with spaces");
    await expect.poll(() => pages().length).toBe(2);
    const second = pages().find((page) => page !== first)!;
    await new TheiaApp(second, new TheiaWorkspace(), true).waitForShellAndInitialized();
    await expect(second.locator("#files .theia-TreeNode", { hasText: "second-workspace.md" })).toBeVisible();
    await expect(second.locator("#files .theia-TreeNode", { hasText: "first-workspace.md" })).toHaveCount(0);
    await expect(first.locator("#files .theia-TreeNode", { hasText: "first-workspace.md" })).toBeVisible();
    await expect.poll(() => pids().length).toBe(2);
    await expect.poll(() => isRunning(pids()[1])).toBe(false);
    expect(isRunning(pids()[0])).toBe(true);
  } finally {
    if (browser) {
      for (const page of browser.contexts().flatMap((context) => context.pages())) {
        await page
          .evaluate(() => {
            (window as typeof window & { electronTheiaCore?: { close(): void } }).electronTheiaCore?.close();
          })
          .catch(() => undefined);
      }
      await expect.poll(() => pids().some(isRunning)).toBe(false);
      await browser.close();
    } else {
      for (const pid of pids()) if (isRunning(pid)) process.kill(pid, "SIGTERM");
    }
    await server.stop();
    await removeTempDir(root);
  }
});
