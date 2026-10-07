import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { clickTab } from "./click-tab";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "..", "..", "applications", "electron");

let app: TheiaApp;
let root: string;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let server: FakeOpenCodeServer;
let tmux: string;
let socket: string;
let sessionId: string;
let dirtyRepo: string;
let browserFixture: BrowserFixtureServer;

// Welcome can create unrelated sessions in other repository folders.
function listAi1TmuxSessions(): string[] {
  try {
    const output = execFileSync(tmux, ["-S", socket, "ls", "-F", "#{session_name}\t#{session_path}"], {
      encoding: "utf8",
    });
    return output
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([name, directory]) => name.startsWith("ai1-") && directory === dirtyRepo)
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function setPermissionPending(pending: boolean): void {
  if (pending) {
    server.pending.add(sessionId);
  } else {
    server.pending.delete(sessionId);
  }
  server.pushEvent(
    pending ? "permission.asked" : "permission.replied",
    pending
      ? {
          sessionID: sessionId,
          id: `per_${sessionId}`,
          action: "external_directory",
          resources: ["/fixture"],
        }
      : { sessionID: sessionId, requestID: `per_${sessionId}`, reply: "reject" },
  );
}

function createShellHome(home: string, shellPath: string): void {
  const quote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
  const startup = `export HOME=${quote(home)}\nexport PATH=${quote(shellPath)}\n`;
  // Restore the fixture PATH after system login-shell startup files.
  for (const file of [".zshenv", ".zprofile", ".zshrc", ".bash_profile", ".bashrc"]) {
    fs.writeFileSync(path.join(home, file), startup);
  }
}

test.beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-m2-agents-")));
  const workspace = path.join(root, "workspace");
  const config = path.join(root, "config");
  const state = path.join(root, "state");
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  const shellPath = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
  for (const directory of [workspace, config, bin, home, path.join(state, "opencode")]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  createShellHome(home, shellPath);
  createMetaRepoFixture(workspace);
  dirtyRepo = path.join(workspace, "dirty-repo");
  tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
  socket = path.join(root, `tmux-${process.getuid!()}`, "default");

  // Block CLI discovery and shell commands from reaching the installed OpenCode.
  fs.writeFileSync(path.join(bin, "opencode"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  server = new FakeOpenCodeServer();
  await server.start();
  sessionId = "m2_fixture";
  const now = Date.now();
  server.sessions = [
    {
      id: sessionId,
      title: "ai1-e2e-session",
      directory: dirtyRepo,
      model: { id: "fake", providerID: "fixture" },
      time: { created: now, updated: now },
    },
  ];
  fs.writeFileSync(
    path.join(state, "opencode", "service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  browserFixture = new BrowserFixtureServer();
  await browserFixture.start();
  electronApp = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [electronAppPath]),
      "--no-sandbox",
      `--app-project-path=${electronAppPath}`,
      `--user-data-dir=${path.join(root, "userdata")}`,
      `--electronUserData=${path.join(root, "userdata")}`,
      workspace,
    ],
    env: {
      ...process.env,
      HOME: home,
      ZDOTDIR: home,
      BASH_ENV: path.join(home, ".bashrc"),
      ENV: path.join(home, ".bashrc"),
      PATH: shellPath,
      THEIA_CONFIG_DIR: config,
      XDG_STATE_HOME: state,
      TMUX_TMPDIR: root,
      TMUX: "",
    },
  });
  const executable = await electronApp.evaluate(() => process.execPath);
  test.info().annotations.push({ type: "electron-executable", description: executable });
  if (process.env.AI1_E2E_EXECUTABLE) {
    expect(fs.realpathSync(executable)).toBe(fs.realpathSync(process.env.AI1_E2E_EXECUTABLE));
  }
  app = new TheiaApp(await electronApp.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  await expect.poll(() => server.requests).toContain("GET /api/event");
});

test.afterEach(async () => {
  const process = electronApp?.process();
  const errors: unknown[] = [];
  const shutdownMarkers = new Set<string>();
  let stderrTail = "";
  const captureStderr = (chunk: Buffer): void => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4096);
    for (const marker of [
      "napi_fatal_error",
      "FATAL ERROR",
      "ERR_IPC_CHANNEL_CLOSED",
      "GPU process exited unexpectedly",
      "Network service crashed",
    ]) {
      if (stderrTail.includes(marker)) shutdownMarkers.add(marker);
    }
  };
  process?.stderr?.on("data", captureStderr);
  try {
    await electronApp?.close();
    if (process) {
      test.info().annotations.push({
        type: "electron-cleanup",
        description: JSON.stringify({ exitCode: process.exitCode, signalCode: process.signalCode }),
      });
      await test.info().attach("electron-shutdown", {
        body: JSON.stringify({
          exitCode: process.exitCode,
          signalCode: process.signalCode,
          errorMarkers: [...shutdownMarkers],
        }),
        contentType: "application/json",
      });
      expect(process.signalCode).toBeNull();
      expect(process.exitCode).toBe(0);
    }
  } catch (error) {
    errors.push(error);
  } finally {
    process?.stderr?.off("data", captureStderr);
    // Complete each cleanup even if shutdown or another cleanup fails.
    const services = await Promise.allSettled([server?.stop(), browserFixture?.stop()]);
    for (const service of services) {
      if (service.status === "rejected") errors.push(service.reason);
    }
    try {
      if (tmux && socket) {
        const cleanup = spawnSync(tmux, ["-S", socket, "kill-server"]);
        test.info().annotations.push({
          type: "tmux-cleanup",
          description: JSON.stringify({ exitCode: cleanup.status, signal: cleanup.signal }),
        });
        if (cleanup.error) errors.push(cleanup.error);
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      await removeTempDir(root);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const error of errors.slice(1)) {
    console.error("Fixture cleanup also fails:", error);
  }
  if (errors.length > 0) throw errors[0];
});

// Do not click an active side-panel tab because that closes the panel.
async function showAgentsView(): Promise<void> {
  if (!(await app.page.locator("#ai1-agents").isVisible())) {
    await clickTab(app.page.locator("#shell-tab-ai1-agents"));
  }
  await expect(app.page.locator("#ai1-agents")).toBeVisible();
}

async function checkAgentsLifecycle(operation: "close" | "reopened"): Promise<void> {
  const result = await app.page.evaluate(async (operation) => {
    type Widget = { id: string; isDisposed: boolean };
    type Shell = {
      id: string;
      getWidgets(area: "right"): Widget[];
      closeWidget(id: string): Promise<Widget | undefined>;
    };
    type Container = {
      parent?: Container;
      _bindingDictionary: { _map: Map<unknown, { cache?: unknown }[]> };
    };
    const browser = window as unknown as {
      theia: { container: Container };
      ai1M2ClosedAgents?: Widget;
    };
    let shell: Shell | undefined;
    for (let scope: Container | undefined = browser.theia.container; scope && !shell; scope = scope.parent) {
      shell = [...scope._bindingDictionary._map.values()]
        .flatMap((bindings) => bindings.map((binding) => binding.cache))
        .find((value) => (value as Shell | undefined)?.id === "theia-app-shell") as Shell | undefined;
    }
    if (!shell) throw new Error("The application shell is not available.");
    const current = shell.getWidgets("right").find((widget) => widget.id === "ai1-agents");
    if (!current) throw new Error("The Agents widget is not in the right shell area.");
    if (operation === "close") {
      browser.ai1M2ClosedAgents = current;
      const closed = await shell.closeWidget(current.id);
      return {
        closedTarget: closed === current,
        disposed: current.isDisposed,
        removedFromShell: !shell.getWidgets("right").includes(current),
      };
    }
    return {
      oldDisposed: browser.ai1M2ClosedAgents?.isDisposed,
      newInstance: current !== browser.ai1M2ClosedAgents,
      newInstanceLive: !current.isDisposed,
    };
  }, operation);
  expect(result).toEqual(
    operation === "close"
      ? { closedTarget: true, disposed: true, removedFromShell: true }
      : { oldDisposed: true, newInstance: true, newInstanceLive: true },
  );
  await test.info().attach(`agents-${operation}`, {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
}

async function showFixtureCard(): Promise<Locator> {
  await showAgentsView();
  const group = app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" });
  await expect(group).toBeVisible();
  const card = app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" });
  if (!(await card.isVisible())) {
    await group.click();
  }
  await expect(card).toBeVisible();
  return card;
}

function sessionTab(title: string): Locator {
  return app.page.locator("#theia-main-content-panel .lm-TabBar-tab").filter({
    has: app.page.locator(".lm-TabBar-tabLabel", { hasText: `sh · ${title}` }),
  });
}

async function terminalForTab(tab: Locator): Promise<Locator> {
  await expect(tab).toBeVisible();
  const id = await tab.getAttribute("id");
  expect(id).toMatch(/^shell-tab-/);
  // Theia puts the target widget ID after this prefix in each tab ID.
  return app.page.locator(`[id=${JSON.stringify(id!.slice("shell-tab-".length))}] .xterm`);
}

test("the Agents view is in the right panel", async () => {
  await showAgentsView();
  await expect(app.page.locator("#theia-right-side-panel #ai1-agents")).toBeVisible();
});

test("the Agents view lists the fixture session under its repository", async () => {
  await showFixtureCard();
});

test("a click on a session card opens its terminal in the center", async () => {
  await (await showFixtureCard()).click();
  await expect(await terminalForTab(sessionTab("ai1-e2e-session"))).toBeVisible();
});

test("a second click focuses the same terminal", async () => {
  const card = await showFixtureCard();
  await card.click();
  const tab = sessionTab("ai1-e2e-session");
  const terminal = await terminalForTab(tab);
  await expect(terminal).toBeVisible();
  const firstId = await tab.getAttribute("id");
  await app.page.locator("#ai1-agents").focus();
  await card.click();
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute("id", firstId!);
  await expect(terminal.locator(".xterm-helper-textarea")).toBeFocused();
});

test("New Session creates a session in the picked repository and opens it", async () => {
  await showAgentsView();
  const before = new Set(server.sessions.map((session) => session.id));
  const group = app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" });
  const groupRow = group.locator("xpath=ancestor::div[contains(@class,'theia-TreeNode')][1]");
  const badgeBefore = Number(await groupRow.locator(".ai1-agents-badge").innerText());

  await app.quickCommandPalette.type("Agents: New Session");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "New Session" }).click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "dirty-repo" }).click();

  await expect.poll(() => server.sessions.filter((session) => !before.has(session.id)).length).toBe(1);
  const created = server.sessions.find((session) => !before.has(session.id))!;
  expect(created.directory).toBe(dirtyRepo);
  await expect(await terminalForTab(sessionTab(created.title))).toBeVisible();
  await expect(groupRow.locator(".ai1-agents-badge")).toHaveText(String(badgeBefore + 1));
});

test("a persistent terminal creates a tmux session", async () => {
  const before = new Set(listAi1TmuxSessions());
  await app.quickCommandPalette.type("New Persistent Terminal");
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "New Persistent Terminal" })
    .click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "dirty-repo" }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · dirty-repo" }),
  ).toBeVisible();
  await expect.poll(() => listAi1TmuxSessions().filter((name) => !before.has(name))).toHaveLength(1);
});

test("a prompt moves the card to working and then to done", async () => {
  const card = await showFixtureCard();
  const row = card.locator("xpath=ancestor::div[contains(@class,'theia-TreeNode')][1]");
  const response = await fetch(`${server.baseUrl}/api/session/${sessionId}/prompt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`opencode:${server.password}`).toString("base64")}`,
    },
    body: JSON.stringify({ text: "Fixture prompt" }),
  });
  expect(response.status).toBe(204);
  expect(server.prompts).toEqual([{ sessionId, body: { text: "Fixture prompt" } }]);
  // Short server turns can finish before the UI sees working state.
  server.active.add(sessionId);
  server.pushEvent("session.execution.started", { sessionID: sessionId });
  await expect(row.locator(".ai1-agents-status-working")).toBeVisible({ timeout: 20_000 });
  server.active.delete(sessionId);
  server.sessions[0].outcome = "succeeded";
  server.pushEvent("session.execution.succeeded", { sessionID: sessionId });
  await expect(row.locator(".ai1-agents-status-done")).toBeVisible({ timeout: 20_000 });
});

test("Design Mode sends drawn feedback and its screenshot to the chosen agent session", async () => {
  const designSession = {
    ...server.sessions[0],
    id: "m2_design",
    title: "ai1-e2e-design-mode-session",
  };
  server.sessions.push(designSession);
  server.pushEvent("session.created", {
    sessionID: designSession.id,
    title: designSession.title,
    directory: dirtyRepo,
  });
  try {
    await openBrowserTab(app, `${browserFixture.url}design-mode`);
    await expect(
      app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "Design Mode Fixture" }),
    ).toBeVisible();
    const browser = app.page.locator(".ai1-browser:not(.lm-mod-hidden)");
    const inspectButton = browser.locator(".ai1-browser-inspect-button");
    await inspectButton.click();
    const selectionOverlay = browser.locator(".ai1-browser-inspect-overlay");
    await expect(selectionOverlay).toBeVisible();
    await selectionOverlay.click({ position: { x: 25, y: 15 } });
    const markupDialog = browser.locator(".ai1-browser-markup-dialog");
    await expect(markupDialog).toBeVisible();
    const canvas = markupDialog.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await app.page.mouse.move(box!.x + 20, box!.y + 20);
    await app.page.mouse.down();
    await app.page.mouse.move(box!.x + 60, box!.y + 45);
    await app.page.mouse.up();
    await markupDialog.getByRole("button", { name: "Use markup" }).click();
    const comment = app.page.locator(".quick-input-widget input");
    await expect(comment).toBeVisible();
    await comment.fill("Move this button down.");
    await comment.press("Enter");
    await browser.getByRole("button", { name: "Send feedback (1)" }).click();
    await app.page
      .locator(".quick-input-widget .monaco-list-row", { hasText: "ai1-e2e-design-mode-session" })
      .click();
    await expect(browser.locator(".ai1-browser-message")).toContainText(
      "Browser feedback sent to ai1-e2e-design-mode-session.",
    );

    const sent = server.prompts.filter((prompt) => prompt.sessionId === designSession.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.text).toContain("Move this button down.");
    expect(sent[0].body.files).toEqual([
      expect.objectContaining({ name: "browser-selection-1.png", uri: expect.any(String) }),
    ]);
  } finally {
    server.sessions = server.sessions.filter((session) => session.id !== designSession.id);
  }
});

test("a session that waits for a permission shows a notice and a badge", async () => {
  await showAgentsView();
  setPermissionPending(true);
  // Select the open toast, not its copy in the notification center.
  const notice = app.page.locator(".theia-notification-toasts.open .theia-notification-list-item", {
    hasText: "waits for a permission",
  });
  const badge = app.page.locator("#shell-tab-ai1-agents .theia-badge-decorator-sidebar");
  try {
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice.locator("button.theia-button", { hasText: "Open" })).toBeVisible();
    await expect(badge).toHaveText("1");

    setPermissionPending(false);

    await expect(notice).toHaveCount(0, { timeout: 30_000 });
    await expect(badge).toHaveCount(0);
  } finally {
    setPermissionPending(false);
  }
});

test("closing and reopening the Agents view keeps the card callbacks and the badge working", async () => {
  await showAgentsView();
  // Close the real widget through the shell, without opening a native menu.
  await checkAgentsLifecycle("close");
  await expect(app.page.locator("#ai1-agents")).toHaveCount(0);

  // Open a new Agents widget instance.
  await app.quickCommandPalette.type("Toggle Agents");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Toggle Agents" }).click();
  await expect(app.page.locator("#theia-right-side-panel #ai1-agents")).toBeVisible();
  await checkAgentsLifecycle("reopened");

  const card = await showFixtureCard();
  await card.click();
  await expect(await terminalForTab(sessionTab("ai1-e2e-session"))).toBeVisible();

  setPermissionPending(true);
  const badge = app.page.locator("#shell-tab-ai1-agents .theia-badge-decorator-sidebar");
  try {
    await expect(badge).toHaveText("1", { timeout: 30_000 });
    setPermissionPending(false);
    await expect(badge).toHaveCount(0);
  } finally {
    setPermissionPending(false);
  }
});

test("a permission request still shows a notice while the Agents view is closed", async () => {
  // Close the widget to check that notices do not depend on its event handlers.
  await showAgentsView();
  await checkAgentsLifecycle("close");
  await expect(app.page.locator("#ai1-agents")).toHaveCount(0);

  setPermissionPending(true);
  const notice = app.page.locator(".theia-notification-toasts.open .theia-notification-list-item", {
    hasText: "waits for a permission",
  });
  try {
    await expect(notice).toBeVisible({ timeout: 30_000 });
    setPermissionPending(false);
    await expect(notice).toHaveCount(0, { timeout: 30_000 });
  } finally {
    setPermissionPending(false);
  }
});
