import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";

// This test proves the fix of Critical 1 (fix round 1): a session tab and a
// persistent-terminal tab must survive a real app restart correctly. That
// needs two separate Electron app instances sharing the same config folder
// (so the stored workbench layout carries over) and the same workspace,
// which `TheiaAppLoader.load` cannot give directly (it does not expose the
// `ElectronApplication` handle needed to fully quit the first instance
// before starting the second). This file launches Electron itself, the same
// way `@theia/playwright`'s `TheiaElectronAppLoader.load` does internally.

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

function listAi1TmuxSessions(): string[] {
  try {
    const output = execFileSync("tmux", ["ls"], { encoding: "utf8" });
    return output
      .split("\n")
      .filter((line) => line.indexOf(":") >= 0)
      .map((line) => line.slice(0, line.indexOf(":")))
      .filter((name) => name.startsWith("ai1-"));
  } catch {
    return [];
  }
}

async function launchApp(workspacePath: string) {
  const electronApp = await electron.launch({
    args: [
      electronAppPath,
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${electronAppPath}`,
      `--plugins=local-dir:${pluginsPath}`,
      workspacePath,
    ],
  });
  const page = await electronApp.firstWindow();
  const app = new TheiaApp(page, new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  return { app, electronApp };
}

async function activateAndType(app: TheiaApp, tabText: string, text: string): Promise<void> {
  await app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: tabText }).click();
  const input = app.page.locator("#theia-main-content-panel .xterm-helper-textarea:visible");
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

let configDir: string;
let workspacePath: string;
let sessionId: string;
let preexistingTmuxSessions: string[];
let tmuxName: string | undefined;

test.beforeAll(() => {
  preexistingTmuxSessions = listAi1TmuxSessions();
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-restart-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  workspacePath = fs.realpathSync(workspace.path);
  const dirtyRepo = path.join(workspacePath, "dirty-repo");
  const raw = execFileSync(
    "opencode",
    [
      "api",
      "POST",
      "/api/session",
      "--data",
      JSON.stringify({ title: "ai1-e2e-restart-session", location: { directory: dirtyRepo } }),
    ],
    { cwd: dirtyRepo, encoding: "utf8" },
  );
  sessionId = JSON.parse(raw).data.id;
});

test.afterAll(async () => {
  try {
    if (sessionId) {
      execFileSync("opencode", ["api", "DELETE", `/api/session/${sessionId}`]);
    }
    if (tmuxName) {
      try {
        execFileSync("tmux", ["kill-session", "-t", tmuxName]);
      } catch (error) {
        console.warn(`could not kill tmux session '${tmuxName}':`, error);
      }
    }
    // In case more than one session was made unexpectedly, still only kill
    // the ones this test made, never one that existed before it.
    for (const name of listAi1TmuxSessions()) {
      if (name !== tmuxName && !preexistingTmuxSessions.includes(name)) {
        try {
          execFileSync("tmux", ["kill-session", "-t", name]);
        } catch (error) {
          console.warn(`could not kill tmux session '${name}':`, error);
        }
      }
    }
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

test("a session tab and a persistent tab survive a restart correctly", async () => {
  const start1 = await launchApp(workspacePath);
  try {
    if (!(await start1.app.page.locator("#ai1-agents").isVisible())) {
      await start1.app.page.locator("#shell-tab-ai1-agents").click();
    }
    const group = start1.app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" });
    await expect(group).toBeVisible();
    const card = start1.app.page.locator("#ai1-agents .ai1-agents-card", {
      hasText: "ai1-e2e-restart-session",
    });
    if (!(await card.isVisible())) {
      await group.click();
    }
    await card.click();
    await expect(
      start1.app.page.locator("#theia-main-content-panel .lm-TabBar-tab", {
        hasText: "OC · ai1-e2e-restart-session",
      }),
    ).toBeVisible();

    await start1.app.quickCommandPalette.type("New Persistent Terminal");
    await start1.app.page
      .locator(".quick-input-widget .monaco-list-row", { hasText: "New Persistent Terminal" })
      .click();
    await start1.app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "dirty-repo" }).click();
    await expect(
      start1.app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · dirty-repo" }),
    ).toBeVisible();

    await expect.poll(() => listAi1TmuxSessions().length).toBe(preexistingTmuxSessions.length + 1);
    tmuxName = listAi1TmuxSessions().find((name) => !preexistingTmuxSessions.includes(name));
    if (!tmuxName) {
      throw new Error("the persistent terminal did not create a new ai1-* tmux session");
    }

    await activateAndType(start1.app, "sh · dirty-repo", "echo AI1_RESTART_MARKER_1");
    await expect
      .poll(() => execFileSync("tmux", ["capture-pane", "-p", "-t", tmuxName!], { encoding: "utf8" }))
      .toContain("AI1_RESTART_MARKER_1");
  } finally {
    await start1.electronApp.close();
  }

  const start2 = await launchApp(workspacePath);
  try {
    await expect(
      start2.app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · dirty-repo" }),
    ).toHaveCount(1);
    await expect(
      start2.app.page.locator("#theia-main-content-panel .lm-TabBar-tab", {
        hasText: "OC · ai1-e2e-restart-session",
      }),
    ).toHaveCount(0);

    await activateAndType(start2.app, "sh · dirty-repo", "echo AI1_RESTART_MARKER_2");
    await expect
      .poll(() => execFileSync("tmux", ["capture-pane", "-p", "-t", tmuxName!], { encoding: "utf8" }))
      .toContain("AI1_RESTART_MARKER_2");
  } finally {
    await start2.electronApp.close();
  }
});
