import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { clickTab } from "./click-tab";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";
import { BrowserFixtureServer } from "./browser-fixture-server";

let root: string;
let tmux: string;
let socket: string;
let server: FakeOpenCodeServer;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;
let browserFixture: BrowserFixtureServer;

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-terminal-shortcut-")));
  const workspace = path.join(root, "workspace");
  const state = path.join(root, "state");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
  fs.mkdirSync(path.join(state, "opencode"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "terminal-test.txt"), "Terminal shortcut test\n");
  execFileSync("git", ["init", path.join(workspace, "child-repo")], { stdio: "pipe" });
  tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
  socket = path.join(root, `tmux-${process.getuid!()}`, "default");
  server = new FakeOpenCodeServer();
  await server.start();
  browserFixture = new BrowserFixtureServer();
  await browserFixture.start();
  fs.writeFileSync(
    path.join(state, "opencode", "service.json"),
    JSON.stringify({
      url: server.baseUrl,
      password: server.password,
    }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  electronApp = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${application}`,
      `--user-data-dir=${path.join(root, "userdata")}`,
      `--electronUserData=${path.join(root, "userdata")}`,
      workspace,
    ],
    env: {
      ...process.env,
      TMUX_TMPDIR: root,
      TMUX: "",
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: state,
    },
  });
  const page = await electronApp.firstWindow();
  app = new TheiaApp(page, new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
});

test.afterAll(async () => {
  await electronApp?.close();
  await server?.stop();
  await browserFixture?.stop();
  if (tmux && socket) {
    spawnSync(tmux, ["-S", socket, "kill-server"]);
  }
  await removeTempDir(root);
});

async function chooseRepository(): Promise<void> {
  await expect(
    app.page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
  ).toBeFocused();
  await expect(app.page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText(
    "./ · workspace",
  );
  await app.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await app.page.keyboard.press("Enter");
  await expect(app.page.locator(".quick-input-widget")).toBeHidden();
}

test("Command-T always opens a center terminal from empty, editor, terminal, and side-panel focus", async () => {
  const page = app.page;
  await page.keyboard.press("Meta+t");
  await chooseRepository();
  await expect(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }),
  ).toHaveCount(1);
  await page.locator("#files .theia-TreeNode", { hasText: "terminal-test.txt" }).dblclick();
  await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
  await app.quickCommandPalette.type("Split Editor Right");
  await page.locator(".quick-input-widget .monaco-list-row", { hasText: "Split Editor Right" }).click();
  const bars = page.locator("#theia-main-content-panel .lm-TabBar");
  await expect(bars).toHaveCount(2);

  for (const index of [0, 1]) {
    await clickTab(bars.nth(index).locator(".lm-TabBar-tab", { hasText: "terminal-test.txt" }));
    await page.keyboard.press("Meta+t");
    await chooseRepository();
    await expect(bars.nth(index).locator(".lm-TabBar-tab", { hasText: "sh · workspace" })).toHaveCount(
      index === 0 ? 2 : 1,
    );
    await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
  }

  await page.keyboard.press("Meta+t");
  await chooseRepository();
  await expect(bars.nth(1).locator(".lm-TabBar-tab", { hasText: "sh · workspace" })).toHaveCount(2);
  await expect(bars.nth(0).locator(".lm-TabBar-tab", { hasText: "sh · workspace" })).toHaveCount(2);

  await clickTab(page.locator("#shell-tab-ai1-agents"));
  await page.locator("#ai1-agents").focus();
  await page.keyboard.press("Meta+t");
  await chooseRepository();
  await expect(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }),
  ).toHaveCount(5);
  await expect(page.locator("#theia-right-side-panel .xterm")).toHaveCount(0);
  await page.locator("#files").focus();
  await page.keyboard.press("Meta+t");
  await chooseRepository();
  await expect(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }),
  ).toHaveCount(6);
  await expect(page.locator("#theia-left-side-panel .xterm")).toHaveCount(0);
  await expect
    .poll(
      () =>
        execFileSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_name}"], { encoding: "utf8" })
          .trim()
          .split("\n").length,
    )
    .toBe(6);
  const directories = execFileSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_path}"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  expect(directories.every((directory) => directory === path.join(root, "workspace"))).toBe(true);
});

test("Terminal appearance matches the local Ghostty font, palette, and padding", async () => {
  const page = app.page;
  await clickTab(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }).first(),
  );
  const terminal = page.locator("#theia-main-content-panel .terminal-container:visible").first();
  await expect(terminal).toHaveCSS("background-color", "rgb(38, 36, 39)");
  await expect(terminal).toHaveCSS("padding", "2px");
  const measure = terminal.locator(".xterm-char-measure-element");
  await expect(measure).toHaveCSS("font-size", "13px");
  await expect(measure).toHaveCSS("font-family", /JetBrainsMono Nerd Font/);
  const colors = await terminal.evaluate((node) => {
    const span = document.createElement("span");
    node.appendChild(span);
    const values = ["foreground", "ansiRed", "ansiGreen", "ansiBlue", "ansiBrightMagenta"].map((name) => {
      span.style.color = `var(--theia-terminal-${name})`;
      return getComputedStyle(span).color;
    });
    span.remove();
    return values;
  });
  expect(colors).toEqual([
    "rgb(252, 252, 250)",
    "rgb(255, 102, 109)",
    "rgb(179, 224, 58)",
    "rgb(0, 205, 232)",
    "rgb(176, 163, 235)",
  ]);
  const input = terminal.locator(".xterm-helper-textarea");
  await input.click();
  await input.fill(
    "printf '\\033[31mRed  \\033[32mGreen  \\033[34mBlue  \\033[35mPurple\\033[0m\\nGhostty-style terminal\\n'",
  );
  await input.press("Enter");
  await expect
    .poll(() => execFileSync(tmux, ["-S", socket, "capture-pane", "-p", "-t", "ai1-1"], { encoding: "utf8" }))
    .toContain("Ghostty-style terminal");
  await terminal.screenshot({ path: test.info().outputPath("ghostty-terminal.png") });
  const settings = path.join(root, "config", "settings.json");
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(
    settings,
    JSON.stringify({
      "workbench.colorTheme": "light",
      "terminal.integrated.fontSize": 20,
      "ai1.terminal.colorOverrides": { background: "#112233" },
    }),
  );
  await expect(page.locator("body")).toHaveClass(/theia-light/);
  await expect(terminal).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(measure).toHaveCSS("font-size", "20px");
  fs.writeFileSync(
    settings,
    JSON.stringify({ "workbench.colorTheme": "light", "ai1.terminal.appearance": "theme" }),
  );
  await expect(terminal).toHaveCSS("background-color", "rgb(255, 255, 255)");
  fs.writeFileSync(settings, "{}");
  await expect(page.locator("body")).toHaveClass(/theia-dark/);
  await expect(terminal).toHaveCSS("background-color", "rgb(38, 36, 39)");
  await expect(measure).toHaveCSS("font-size", "13px");
});

test("Command-T from a browser page opens the terminal beside that browser", async () => {
  const page = app.page;
  await openBrowserTab(app, browserFixture.url);
  const browser = page.locator(".ai1-browser:visible");
  const id = await browser.getAttribute("id");
  const bar = page.locator("#theia-main-content-panel .lm-TabBar", {
    has: page.locator(`[id="shell-tab-${id}"]`),
  });
  await expect(bar).toHaveCount(1);
  const terminalTabs = bar.locator(".lm-TabBar-tab", { hasText: "sh · workspace" });
  const previous = await terminalTabs.count();
  const guest = browser.locator("webview");
  let guestId = 0;
  await expect
    .poll(async () => {
      guestId = await guest
        .evaluate((node) => (node as unknown as { getWebContentsId(): number }).getWebContentsId())
        .catch(() => 0);
      return guestId;
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      guest.evaluate((node) =>
        (node as unknown as { executeJavaScript(script: string): Promise<string> }).executeJavaScript(
          "document.readyState",
        ),
      ),
    )
    .toBe("complete");
  await guest.click({ position: { x: 20, y: 20 } });
  await electronApp.evaluate(({ webContents }, target) => {
    const contents = webContents.fromId(target)!;
    contents.focus();
    contents.sendInputEvent({ type: "keyDown", keyCode: "T", modifiers: ["meta"] });
    contents.sendInputEvent({ type: "keyUp", keyCode: "T", modifiers: ["meta"] });
  }, guestId);
  await chooseRepository();
  await expect(terminalTabs).toHaveCount(previous + 1);
  await expect(page.locator("#theia-main-content-panel .xterm-helper-textarea:focus")).toHaveCount(1);
});

test("Command-D splits right and Command-Shift-D splits down without a directory picker", async () => {
  const page = app.page;
  await clickTab(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }).first(),
  );
  const sessionsBefore = execFileSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_name}"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n").length;
  const input = page.locator("#theia-main-content-panel .xterm-helper-textarea:focus");
  const focusedTerminal = page.locator("#theia-main-content-panel .xterm", {
    has: page.locator(".xterm-helper-textarea:focus"),
  });
  await expect(input).toHaveCount(1);
  const before = (await focusedTerminal.boundingBox())!;
  const bars = page.locator("#theia-main-content-panel .lm-TabBar");
  const count = await bars.count();
  await page.keyboard.press("Meta+d");
  await expect(bars).toHaveCount(count + 1);
  await expect(input).toHaveCount(1);
  await expect.poll(async () => (await focusedTerminal.boundingBox())!.x).toBeGreaterThan(before.x);
  const right = (await focusedTerminal.boundingBox())!;
  expect(right.x).toBeGreaterThan(before.x);
  expect(Math.abs(right.y - before.y)).toBeLessThan(10);
  await expect(page.locator(".quick-input-widget")).toBeHidden();
  await page.keyboard.press("Meta+Shift+d");
  await expect(bars).toHaveCount(count + 2);
  await expect(input).toHaveCount(1);
  await expect.poll(async () => (await focusedTerminal.boundingBox())!.y).toBeGreaterThan(right.y);
  const bottom = (await focusedTerminal.boundingBox())!;
  expect(bottom.y).toBeGreaterThan(right.y);
  expect(Math.abs(bottom.x - right.x)).toBeLessThan(10);
  await expect(page.locator(".quick-input-widget")).toBeHidden();
  await expect
    .poll(() =>
      execFileSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_path}"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n"),
    )
    .toEqual(Array(sessionsBefore + 2).fill(path.join(root, "workspace")));
});

test("Command-B hides and shows Explorer from terminal focus", async () => {
  const page = app.page;
  const explorer = page.locator("#theia-left-side-panel #files");
  await expect(explorer).toBeVisible();
  await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
  await page.keyboard.press("Meta+b");
  await expect(explorer).toBeHidden();
  await page.keyboard.press("Meta+b");
  await expect(explorer).toBeVisible();
});

test("Ghostty split controls move focus, resize, and restore zoom", async () => {
  const page = app.page;
  const panel = page.locator("#theia-main-content-panel");
  const bars = panel.locator(".lm-TabBar");
  const focused = panel.locator(".xterm", { has: page.locator(".xterm-helper-textarea:focus") });
  await clickTab(panel.locator(".lm-TabBar-tab", { hasText: "sh · workspace" }).first());
  const first = (await focused.boundingBox())!;
  await page.keyboard.press("Meta+Alt+ArrowRight");
  await expect.poll(async () => (await focused.boundingBox())!.x).toBeGreaterThan(first.x);
  const right = (await focused.boundingBox())!;
  await page.keyboard.press("Meta+Alt+ArrowDown");
  await expect.poll(async () => (await focused.boundingBox())!.y).toBeGreaterThan(right.y);
  await page.keyboard.press("Meta+Alt+ArrowUp");
  await expect.poll(async () => (await focused.boundingBox())!.y).toBeLessThan(right.y + 10);
  const focusedPane = panel.locator(".terminal-container", {
    has: page.locator(".xterm-helper-textarea:focus"),
  });
  const beforeResize = (await focusedPane.boundingBox())!;
  await page.keyboard.press("Meta+Control+ArrowDown");
  await expect
    .poll(async () => (await focusedPane.boundingBox())!.height)
    .toBeGreaterThan(beforeResize.height);
  await page.keyboard.press("Meta+Control+ArrowUp");
  await expect
    .poll(async () => Math.abs((await focusedPane.boundingBox())!.height - beforeResize.height))
    .toBeLessThan(2);
  const beforeHorizontal = (await focusedPane.boundingBox())!;
  await page.keyboard.press("Meta+Control+ArrowLeft");
  await expect
    .poll(async () => (await focusedPane.boundingBox())!.width)
    .toBeGreaterThan(beforeHorizontal.width);
  await page.keyboard.press("Meta+Control+ArrowRight");
  await expect
    .poll(async () => Math.abs((await focusedPane.boundingBox())!.width - beforeHorizontal.width))
    .toBeLessThan(2);
  const count = await bars.count();
  const beforeZoom = (await focused.boundingBox())!;
  await page.keyboard.press("Meta+Shift+Enter");
  await expect(panel.locator(".xterm:visible")).toHaveCount(1);
  await expect.poll(async () => (await focused.boundingBox())!.width).toBeGreaterThan(beforeZoom.width);
  await page.keyboard.press("Meta+Shift+Enter");
  await expect(bars).toHaveCount(count);
  await expect
    .poll(async () => Math.abs((await focused.boundingBox())!.width - beforeZoom.width))
    .toBeLessThan(2);
  const id = await focused.locator("textarea").evaluate((node) => node.closest(".terminal-container")?.id);
  await page.keyboard.press("Meta+]");
  await expect
    .poll(() => focused.locator("textarea").evaluate((node) => node.closest(".terminal-container")?.id))
    .not.toBe(id);
  await page.keyboard.press("Meta+[");
  await expect
    .poll(() => focused.locator("textarea").evaluate((node) => node.closest(".terminal-container")?.id))
    .toBe(id);
});

test("Command-F opens terminal search and Escape returns to terminal input", async () => {
  const page = app.page;
  await page.keyboard.press("Meta+f");
  const search = page.locator(".theia-search-terminal-widget input:visible");
  await expect(search).toBeFocused();
  await search.fill("workspace");
  await search.press("Enter");
  await search.press("Escape");
  await expect(search).toBeHidden();
  await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
});

test("A new terminal split restores the layout before it leaves zoom", async () => {
  const page = app.page;
  const panel = page.locator("#theia-main-content-panel");
  const bars = panel.locator(".lm-TabBar");
  const before = await bars.count();
  const tabs = await panel.locator(".lm-TabBar-tab", { hasText: "sh · workspace" }).count();
  await page.keyboard.press("Meta+Shift+Enter");
  await expect(panel.locator(".xterm:visible")).toHaveCount(1);
  await page.keyboard.press("Meta+d");
  await expect(bars).toHaveCount(before + 1);
  await expect(panel.locator(".lm-TabBar-tab", { hasText: "sh · workspace" })).toHaveCount(tabs + 1);
  await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
});

test("Command-Backspace sends Ghostty's Control-U input in Bash and Zsh", async () => {
  const page = app.page;
  await clickTab(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · workspace" }).first(),
  );
  const input = page.locator(".xterm-helper-textarea:focus");
  const marker = path.join(root, "delete-line-result");
  const runTmux = (args: string[]): string =>
    execFileSync(tmux, ["-S", socket, ...args], {
      encoding: "utf8",
      timeout: 5000,
    });
  await expect(input).toHaveCount(1);
  for (const shell of ["/bin/bash --noprofile --norc", "/bin/zsh -f"]) {
    runTmux([
      "send-keys",
      "-t",
      "ai1-1",
      "-l",
      `${shell}; printf ready > '${path.join(root, "shell-exited")}'`,
    ]);
    runTmux(["send-keys", "-t", "ai1-1", "Enter"]);
    await expect
      .poll(() => runTmux(["display-message", "-p", "-t", "ai1-1", "#{pane_current_command}"]).trim())
      .toBe(shell.startsWith("/bin/bash") ? "bash" : "zsh");
    runTmux([
      "send-keys",
      "-t",
      "ai1-1",
      "-l",
      `set -o emacs; printf ready > '${path.join(root, "shell-ready")}'`,
    ]);
    runTmux(["send-keys", "-t", "ai1-1", "Enter"]);
    await expect.poll(() => fs.existsSync(path.join(root, "shell-ready"))).toBe(true);
    fs.unlinkSync(path.join(root, "shell-ready"));
    const command = `printf kept > '${marker}'`;
    runTmux(["send-keys", "-t", "ai1-1", "-l", `discard ${command}`]);
    await page.keyboard.press("Meta+ArrowLeft");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+Backspace");
    await page.keyboard.press("Meta+ArrowRight");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(() => (fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "")).toBe("kept");
    fs.unlinkSync(marker);
    runTmux(["send-keys", "-t", "ai1-1", "-l", `discard ${command}`]);
    runTmux(["send-keys", "-t", "ai1-1", "-N", String(command.length), "Left"]);
    await expect
      .poll(() =>
        runTmux(["capture-pane", "-J", "-S", "-100", "-p", "-t", "ai1-1"]).replace(/\r?\n/g, "").trim(),
      )
      .toContain("discard printf");
    await page.keyboard.press("Meta+Backspace");
    await page.keyboard.press("Enter");
    const completed = path.join(root, "delete-line-completed");
    runTmux(["send-keys", "-t", "ai1-1", "-l", `printf done > '${completed}'`]);
    runTmux(["send-keys", "-t", "ai1-1", "Enter"]);
    await expect.poll(() => fs.existsSync(completed)).toBe(true);
    fs.unlinkSync(completed);
    if (shell.startsWith("/bin/bash")) {
      expect(fs.readFileSync(marker, "utf8")).toBe("kept");
      fs.unlinkSync(marker);
    } else {
      expect(fs.existsSync(marker)).toBe(false);
    }
    runTmux(["send-keys", "-t", "ai1-1", "-l", "exit"]);
    runTmux(["send-keys", "-t", "ai1-1", "Enter"]);
    await expect.poll(() => fs.existsSync(path.join(root, "shell-exited"))).toBe(true);
    fs.unlinkSync(path.join(root, "shell-exited"));
  }
});

test("Shift+Enter sends the OpenCode newline key while Enter retains its submit key", async () => {
  const page = app.page;
  const sessions = (): string[] => {
    const result = spawnSync(tmux, ["-S", socket, "list-sessions", "-F", "#{session_name}"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return result.status === 0 ? result.stdout.trim().split("\n") : [];
  };
  const previous = new Set(sessions());
  const reader = path.join(root, "read-terminal-keys.cjs");
  const ready = path.join(root, "terminal-keys-ready");
  const output = path.join(root, "terminal-keys.json");
  fs.writeFileSync(
    reader,
    `const fs = require("node:fs");
    process.stdin.setRawMode(true);
    fs.writeFileSync(${JSON.stringify(ready)}, "ready");
    let bytes = Buffer.alloc(0);
    process.stdin.on("data", chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length >= 2) {
        fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify([...bytes]));
        process.stdin.setRawMode(false);
        process.exit(0);
      }
    });`,
  );
  await page.keyboard.press("Meta+t");
  await chooseRepository();
  await expect.poll(() => sessions().filter((name) => !previous.has(name)).length).toBe(1);
  const target = sessions().find((name) => !previous.has(name))!;
  const input = page.locator(".xterm-helper-textarea:focus");
  execFileSync(tmux, ["-S", socket, "send-keys", "-t", target, "-l", `'${process.execPath}' '${reader}'`], {
    timeout: 5000,
  });
  execFileSync(tmux, ["-S", socket, "send-keys", "-t", target, "Enter"], { timeout: 5000 });
  await expect.poll(() => fs.existsSync(ready)).toBe(true);
  await input.press("Shift+Enter");
  await input.press("Enter");
  await expect.poll(() => fs.existsSync(output)).toBe(true);
  expect(JSON.parse(fs.readFileSync(output, "utf8"))).toEqual([10, 13]);
});
