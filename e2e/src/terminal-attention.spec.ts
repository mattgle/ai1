import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createServer, ServerResponse } from "node:http";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import type {} from "@theia/core/lib/electron-common/electron-api";
import { removeTempDir } from "./remove-temp-dir";
import { clickTab } from "./click-tab";

test.describe.configure({ mode: "serial" });

const application =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
const streams = new Set<ServerResponse>();
let root: string;
let app: TheiaApp;
let processApp: Awaited<ReturnType<typeof electron.launch>>;
let launchOptions: Parameters<typeof electron.launch>[0];
let service: ReturnType<typeof createServer>;
let formPending = false;

function emit(type: string, data: Record<string, unknown> = {}): void {
  for (const stream of streams)
    stream.write(`data: ${JSON.stringify({ type, data: { sessionID: "attention-fixture", ...data } })}\n\n`);
}

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-attention-test-")));
  const workspace = path.join(root, "workspace");
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  const state = path.join(root, "state");
  for (const folder of [workspace, home, bin, path.join(state, "opencode")])
    fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(bin, "opencode"), "#!/bin/sh\nexec /bin/cat\n", { mode: 0o755 });
  const tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(bin, "tmux"), `#!/bin/sh\nexec "${tmux}" -L "${path.basename(root)}" "$@"\n`, {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(home, ".zshenv"), `export PATH="${bin}:$PATH"\n`);
  service = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (url.pathname === "/api/event") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": ready\n\n");
      streams.add(response);
      response.on("close", () => streams.delete(response));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/session") {
      response.end(
        JSON.stringify({
          data: [
            {
              id: "attention-fixture",
              title: "Attention fixture",
              location: { directory: workspace },
              time: { created: Date.now(), updated: Date.now() },
            },
            {
              id: "other-fixture",
              title: "Other fixture",
              location: { directory: workspace },
              time: { created: Date.now(), updated: Date.now() },
            },
          ],
        }),
      );
    } else if (url.pathname === "/api/session/active") {
      response.end(JSON.stringify({ data: {} }));
    } else if (url.pathname === "/api/session/attention-fixture/form") {
      response.end(JSON.stringify({ data: formPending ? [{ id: "frm_fixture" }] : [] }));
    } else {
      response.end(JSON.stringify({ data: [] }));
    }
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  if (!address || typeof address === "string") throw new Error("The fixture server has no port.");
  fs.writeFileSync(
    path.join(state, "opencode/service.json"),
    JSON.stringify({ url: `http://127.0.0.1:${address.port}`, password: "fixture-only" }),
  );
  const userData = path.join(root, "userdata");
  launchOptions = {
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${application}`,
      `--plugins=local-dir:${application}/plugins`,
      `--user-data-dir=${userData}`,
      `--electronUserData=${userData}`,
      workspace,
    ],
    env: {
      ...process.env,
      HOME: home,
      ZDOTDIR: home,
      XDG_STATE_HOME: state,
      THEIA_CONFIG_DIR: path.join(root, "config"),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  };
  processApp = await electron.launch(launchOptions);
  app = new TheiaApp(await processApp.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  await clickTab(app.page.locator("#shell-tab-ai1-agents"));
  await app.page.locator(".ai1-agents-group").getByText("workspace", { exact: true }).click();
  await app.page.locator(".ai1-agents").getByText("Attention fixture", { exact: true }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab").filter({ hasText: "Attention fixture" }),
  ).toBeVisible();
  await app.page.locator(".ai1-agents").getByText("Other fixture", { exact: true }).click();
});

test.afterAll(async () => {
  await processApp?.close();
  if (root) {
    try {
      execFileSync(path.join(root, "bin/tmux"), ["kill-server"], { stdio: "ignore" });
    } catch {
      /* The isolated server can already be stopped. */
    }
  }
  service?.closeAllConnections();
  if (service) await new Promise<void>((resolve) => service.close(() => resolve()));
  if (root) await removeTempDir(root);
});

test("panels and tabs have rounded corners", async () => {
  const panel = app.page.locator("#theia-main-content-panel");
  await expect(panel).toHaveCSS("border-top-left-radius", "6px");
  await expect(panel.locator(".lm-TabBar-tab").first()).toHaveCSS("border-top-left-radius", "5px");
});

test("working stays visible on selected and hidden terminal tabs", async () => {
  const tab = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "Attention fixture" });
  emit("session.execution.started");
  await expect(tab).toHaveClass(/ai1-attention-working/);
  await clickTab(tab);
  await expect(tab).toHaveClass(/ai1-attention-working/);
  await tab.hover();
  await expect(app.page.locator(".theia-hover")).toContainText("Working");
});

test("section badge stays inside its icon tab", async () => {
  emit("permission.asked", { id: "badge-permission" });
  const badge = app.page.locator("#shell-tab-ai1-agents .theia-badge-decorator-sidebar");
  await expect(badge).toBeVisible();
  const bounds = await badge.evaluate((node) => {
    const badgeRect = node.getBoundingClientRect();
    const tabRect = node.closest(".lm-TabBar-tab")!.getBoundingClientRect();
    return {
      left: badgeRect.left - tabRect.left,
      right: tabRect.right - badgeRect.right,
      top: badgeRect.top - tabRect.top,
      bottom: tabRect.bottom - badgeRect.bottom,
      fits: node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeGreaterThanOrEqual(0);
  expect(bounds.fits).toBe(true);
  emit("permission.replied", { requestID: "badge-permission", reply: "once" });
});

test("panel surfaces have real gaps and clip their visible corners", async () => {
  const surfaces = await app.page.evaluate(() => {
    const main = document.getElementById("theia-main-content-panel")!;
    const workspace = document.getElementById("theia-left-right-split-panel")!;
    const rect = main.getBoundingClientRect();
    const frame = workspace.getBoundingClientRect();
    const sides = ["left", "right"].map((side) => {
      const container = document.getElementById(`theia-${side}-content-panel`)!;
      const bounds = container.getBoundingClientRect();
      const corner = document.elementFromPoint(bounds.x + 1, bounds.y + 1);
      return {
        radius: getComputedStyle(container).borderTopLeftRadius,
        clipped: !corner || corner === container || !container.contains(corner),
        corner: corner?.outerHTML.slice(0, 200),
        overflow: getComputedStyle(container).overflow,
        gap: side === "left" ? rect.left - bounds.right : bounds.left - rect.right,
      };
    });
    return {
      topGap: rect.top - frame.top,
      bottomGap: frame.bottom - rect.bottom,
      border: getComputedStyle(main).borderTopWidth,
      sides,
    };
  });
  expect(surfaces.topGap).toBeGreaterThanOrEqual(2);
  expect(surfaces.bottomGap).toBeGreaterThanOrEqual(2);
  expect(surfaces.border).toBe("1px");
  for (const side of surfaces.sides) {
    expect(side.radius).toBe("6px");
    expect(side.clipped, JSON.stringify(side)).toBe(true);
    expect(side.gap).toBeCloseTo(4, 0);
  }
});

test("dark workspace groups activity bars and uses a neutral frame", async () => {
  await expect(app.page.locator("body")).toHaveCSS("background-color", "rgb(24, 24, 24)");
  await expect(app.page.locator("#theia-statusBar")).toHaveCSS("background-color", "rgb(24, 24, 24)");
  for (const side of ["left", "right"]) {
    const container = app.page.locator(`#theia-${side}-content-panel`);
    await expect(container).toHaveCSS("background-color", "rgb(24, 24, 24)");
    const distance = await container.evaluate((node, direction) => {
      const activity = node.querySelector(".theia-app-sidebar-container")!.getBoundingClientRect();
      const content = Array.from(node.children)
        .find((child) => !child.classList.contains("theia-app-sidebar-container"))!
        .getBoundingClientRect();
      return direction === "left" ? content.left - activity.right : activity.left - content.right;
    }, side);
    expect(distance).toBeCloseTo(0, 0);
  }
});

test("hidden permission attention stays after selection and clears on reply", async () => {
  const tab = app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "Attention fixture" });
  await app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "Other fixture" })
    .click();
  emit("permission.asked", { id: "fixture-permission" });
  await expect(tab).toHaveClass(/ai1-attention-input/);
  await app.page.screenshot({
    path: process.env.AI1_ATTENTION_SCREENSHOT ?? test.info().outputPath("rounded-terminal-attention.png"),
  });
  await tab.hover();
  await expect(app.page.locator(".theia-hover")).toContainText("Needs your input");
  await clickTab(tab);
  await expect(tab).toHaveClass(/ai1-attention-input/);
  emit("permission.replied", { requestID: "fixture-permission", reply: "once" });
  await expect(tab).not.toHaveClass(/ai1-attention-input/);
});

test("completion and failure clear on selection and return for a new turn", async () => {
  const tab = app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "Attention fixture" });
  for (const [event, state] of [
    ["session.execution.succeeded", "done"],
    ["session.execution.failed", "failed"],
  ]) {
    await app.page
      .locator("#theia-main-content-panel .lm-TabBar-tab")
      .filter({ hasText: "Other fixture" })
      .click();
    emit("session.execution.started");
    emit(event);
    await expect(tab).toHaveClass(new RegExp(`ai1-attention-${state}`));
    await expect(tab).toHaveCSS("box-shadow", /inset/);
    await tab.click();
    await expect(tab).not.toHaveClass(/ai1-attention-/);
    await app.page
      .locator("#theia-main-content-panel .lm-TabBar-tab")
      .filter({ hasText: "Other fixture" })
      .click();
    await expect(tab).not.toHaveClass(/ai1-attention-/);
  }
});

test("OpenCode question forms keep input attention until the answer", async () => {
  const tab = app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "Attention fixture" });
  await clickTab(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab").filter({ hasText: "Other fixture" }),
  );
  formPending = true;
  await expect(tab).toHaveClass(/ai1-attention-input/);
  await clickTab(tab);
  await expect(tab).toHaveClass(/ai1-attention-input/);
  formPending = false;
  await expect(tab).not.toHaveClass(/ai1-attention-input/);
});

test("Claude, Codex, and Gemini hooks decorate an isolated regular terminal", async () => {
  await app.page.keyboard.press(process.platform === "darwin" ? "Meta+t" : "Control+t");
  await expect(app.page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText("workspace");
  await app.page.keyboard.press("Enter");
  await expect(app.page.locator(".quick-input-widget")).toBeHidden();
  const tab = app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "sh · workspace" });
  await expect(tab).toBeVisible();
  const tmux = path.join(root, "bin/tmux");
  let pane = "";
  await expect
    .poll(() => {
      try {
        pane = execFileSync(tmux, ["list-panes", "-t", "ai1-3", "-F", "#{pane_id}"], {
          encoding: "utf8",
        }).trim();
      } catch {
        pane = "";
      }
      return pane;
    })
    .toMatch(/^%\d+$/);
  await app.quickCommandPalette.type("Set Up Agent Attention Hooks");
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "Set Up Agent Attention Hooks" })
    .click();
  const instructions = await app.page
    .getByRole("textbox", { name: "Agent hook setup instructions" })
    .inputValue();
  const hook = instructions.match(/node '([^']+terminal-attention-hook\.js)'/)![1];
  await app.page.getByRole("button", { name: "Close", exact: true }).click();
  const send = (agent: "claude" | "codex" | "gemini", event: string): void => {
    const output = execFileSync(
      process.execPath,
      [hook, agent, path.join(root, "config/terminal-attention")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
          TMUX_PANE: pane,
        },
        input: JSON.stringify({
          hook_event_name: event,
          notification_type: "ToolPermission",
          session_id: `fixture-${agent}`,
          tool_name: "Bash",
          tool_input: { command: "private fixture text" },
        }),
      },
    );
    expect(output.trim()).toBe("{}");
  };
  for (const agent of ["claude", "codex", "gemini"] as const) {
    await clickTab(
      app.page.locator("#theia-main-content-panel .lm-TabBar-tab").filter({ hasText: "Other fixture" }),
    );
    send(agent, agent === "gemini" ? "Notification" : "PermissionRequest");
    await expect(tab).toHaveClass(/ai1-attention-input/);
    await clickTab(tab);
    await expect(tab).toHaveClass(/ai1-attention-input/);
    send(agent, agent === "gemini" ? "AfterTool" : "PostToolUse");
    await expect(tab).toHaveClass(/ai1-attention-input/);
    send(agent, agent === "gemini" ? "BeforeAgent" : "UserPromptSubmit");
    await expect(tab).toHaveClass(/ai1-attention-working/);
    await clickTab(
      app.page.locator("#theia-main-content-panel .lm-TabBar-tab").filter({ hasText: "Other fixture" }),
    );
    send(agent, agent === "claude" ? "StopFailure" : agent === "gemini" ? "AfterAgent" : "Stop");
    await expect(tab).toHaveClass(agent === "claude" ? /ai1-attention-failed/ : /ai1-attention-done/);
    await clickTab(tab);
    await expect(tab).not.toHaveClass(/ai1-attention-/);
  }
});

test("hook setup gives instructions without changing agent settings", async () => {
  await app.quickCommandPalette.type("Set Up Agent Attention Hooks");
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "Set Up Agent Attention Hooks" })
    .click();
  const instructions = app.page.getByRole("textbox", { name: "Agent hook setup instructions" });
  await expect(instructions).toBeVisible();
  await expect(instructions).toHaveValue(/terminal-attention-hook\.js/);
  const helper = (await instructions.inputValue()).match(/node '([^']+terminal-attention-hook\.js)'/);
  expect(helper).not.toBeNull();
  expect(fs.statSync(helper![1]).isFile()).toBe(true);
  expect(fs.existsSync(path.join(root, "home/.claude/settings.json"))).toBe(false);
  expect(fs.existsSync(path.join(root, "home/.codex/hooks.json"))).toBe(false);
  expect(fs.existsSync(path.join(root, "home/.gemini/settings.json"))).toBe(false);
  await expect(instructions).toHaveValue(/Gemini CLI/);
  await app.page.getByRole("button", { name: "Close", exact: true }).click();
});

test("attention stays visible in light and high-contrast themes", async () => {
  const config = path.join(root, "config/settings.json");
  const original = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, "utf8")) : {};
  const titleBarStyle = await app.page.evaluate(() => window.electronTheiaCore.getTitleBarStyleAtStartup());
  // Keep the current window style while this test changes only the theme.
  fs.writeFileSync(
    config,
    JSON.stringify({ ...original, "window.titleBarStyle": titleBarStyle, "files.autoSave": "off" }),
  );
  const tab = app.page
    .locator("#theia-main-content-panel .lm-TabBar-tab")
    .filter({ hasText: "Attention fixture" });
  for (const theme of ["light", "hc-theia", "dark"]) {
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(config, "utf8")), "workbench.colorTheme": theme }),
    );
    await expect(app.page.locator("body")).toHaveClass(
      theme === "hc-theia" ? /theia-hc/ : new RegExp(`theia-${theme}`),
    );
    const saved = JSON.parse(fs.readFileSync(config, "utf8"));
    expect(saved["window.titleBarStyle"]).toBe(titleBarStyle);
    expect(saved["files.autoSave"]).toBe("off");
    emit("permission.asked", { id: `theme-${theme}` });
    await expect(tab).toHaveClass(/ai1-attention-input/);
    await expect(tab).toHaveCSS("box-shadow", /inset/);
    if (theme === "hc-theia") await expect(tab).toHaveCSS("outline-width", "2px");
    emit("permission.replied", { requestID: `theme-${theme}`, reply: "once" });
    await expect(tab).not.toHaveClass(/ai1-attention-input/);
  }
});

test("Control+C returns to the shell and reopening the session only focuses it", async () => {
  const tab = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", {
    hasText: "sh · Attention fixture",
  });
  await clickTab(tab);
  await app.page.locator(".terminal-container:visible .xterm-helper-textarea").focus();
  await app.page.keyboard.press("Control+c");
  const tmux = path.join(root, "bin/tmux");
  await expect
    .poll(() =>
      execFileSync(tmux, ["show-options", "-q", "-t", "ai1-1", "-v", "@ai1_agent_session"], {
        encoding: "utf8",
      }).trim(),
    )
    .toBe("");
  await expect(tab).toBeVisible();
  await expect(tab).not.toHaveClass(/ai1-attention-/);
  execFileSync(tmux, ["send-keys", "-t", "ai1-1", "-l", "printf 'AI1_SHELL_READY:%s\\n' \"$PWD\""]);
  execFileSync(tmux, ["send-keys", "-t", "ai1-1", "Enter"]);
  await expect
    .poll(() => execFileSync(tmux, ["capture-pane", "-p", "-J", "-t", "ai1-1"], { encoding: "utf8" }))
    .toContain(`AI1_SHELL_READY:${path.join(root, "workspace")}`);
  await app.page.locator(".ai1-agents").getByText("Attention fixture", { exact: true }).click();
  await expect(tab).toHaveCount(1);
  expect(
    execFileSync(tmux, ["show-options", "-q", "-t", "ai1-1", "-v", "@ai1_agent_session"], {
      encoding: "utf8",
    }).trim(),
  ).toBe("");
});

test("a session shell survives normal quit and remains usable", async () => {
  await Promise.all([processApp.waitForEvent("close"), processApp.evaluate(({ app }) => app.quit())]);
  processApp = await electron.launch(launchOptions);
  app = new TheiaApp(await processApp.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh ·" });
  const tab = tabs.filter({ hasText: "Attention fixture" });
  await expect(tabs).toHaveCount(3);
  await expect(tab).toBeVisible();
  if (!(await app.page.locator("#ai1-agents").isVisible())) {
    await clickTab(app.page.locator("#shell-tab-ai1-agents"));
  }
  const session = app.page.locator(".ai1-agents").getByText("Attention fixture", { exact: true });
  const group = app.page.locator("#ai1-agents .theia-TreeNode", {
    has: app.page.getByText("workspace", { exact: true }),
  });
  await expect(group).toBeVisible();
  if (!(await session.isVisible())) await group.locator(".theia-ExpansionToggle").click();
  await expect(session).toBeVisible();
  await session.click();
  await expect(tabs).toHaveCount(3);
  const tmux = path.join(root, "bin/tmux");
  expect(
    execFileSync(tmux, ["show-options", "-q", "-t", "ai1-1", "-v", "@ai1_agent_session"], {
      encoding: "utf8",
    }).trim(),
  ).toBe("");
  execFileSync(tmux, ["send-keys", "-t", "ai1-1", "-l", "echo AI1_SESSION_SHELL_RESTORED"]);
  execFileSync(tmux, ["send-keys", "-t", "ai1-1", "Enter"]);
  await expect
    .poll(() => execFileSync(tmux, ["capture-pane", "-p", "-J", "-t", "ai1-1"], { encoding: "utf8" }))
    .toContain("AI1_SESSION_SHELL_RESTORED");
});

test("session deletion and idle cleanup keep normal shells open", async () => {
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh ·" });
  await app.quickCommandPalette.type("Agents: Delete Session");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Delete Session" }).click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Attention fixture" }).click();
  await app.page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(tabs.filter({ hasText: "Attention fixture" })).toBeVisible();
  await expect(tabs).toHaveCount(3);
  await app.quickCommandPalette.type("Close Idle Terminals");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Close Idle Terminals" }).click();
  await expect(tabs).toHaveCount(3);
});
