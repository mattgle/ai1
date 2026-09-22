import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let sessionId: string;
let preexistingTmuxSessions: string[];

// Reads the names of the ai1-* tmux sessions from the output of `tmux ls`.
// No tmux server running is not an error: it just means no session exists.
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

test.beforeAll(async ({ playwright, browser }) => {
  preexistingTmuxSessions = listAi1TmuxSessions();
  // The application must not write into the real settings folder of the
  // machine during a test run. Playwright's Electron launch inherits the
  // runner's environment, so this folder becomes the app's settings folder.
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  // OpenCode stores `location.directory` verbatim, with no resolution of
  // its own (fact 4a of theia-api-facts-m2.md). The Electron main process,
  // on its side, resolves the workspace path with `fs.realpath` before it
  // opens the window (`electron-main-application.ts`), so on a system where
  // the temporary folder is a symlink (`/var` on macOS) the running app's
  // workspace root is already the resolved path. This directory must equal
  // that resolved root, or the Agents service filters the session out of
  // every group. `AgentsServiceImpl.normalizeRoot`'s own `fs.realpathSync`
  // call (fix round 1, defect 4) resolves symbolic links on the root's
  // side of that comparison, for a root a real deployment might hand it
  // unresolved; it does not touch this session directory, the other side
  // of the comparison, so this resolution still belongs here.
  const dirtyRepo = path.join(fs.realpathSync(workspace.path), "dirty-repo");
  // The directory of a created session comes from the request body, not a
  // query parameter or the process cwd of the opencode CLI's own server.
  const raw = execFileSync(
    "opencode",
    [
      "api",
      "POST",
      "/api/session",
      "--data",
      JSON.stringify({ title: "ai1-e2e-session", location: { directory: dirtyRepo } }),
    ],
    { cwd: dirtyRepo, encoding: "utf8" },
  );
  sessionId = JSON.parse(raw).data.id;
  app = await TheiaAppLoader.load(
    { playwright, browser, useElectron: { electronAppPath, pluginsPath } },
    workspace,
  );
});

test.afterAll(async () => {
  try {
    await app.page.close();
  } finally {
    if (sessionId) {
      execFileSync("opencode", ["api", "DELETE", `/api/session/${sessionId}`]);
    }
    // Kill only the ai1-* tmux sessions this test made, never one that
    // existed before it (the owner's own sessions).
    for (const name of listAi1TmuxSessions()) {
      if (!preexistingTmuxSessions.includes(name)) {
        execFileSync("tmux", ["kill-session", "-t", name]);
      }
    }
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

// The right side panel shows one view at a time. The Changes view opens as
// the default view (Task M1), so a test selects the Agents tab before it
// checks that view's content, the same way an earlier test in the M1 suite
// clicks a file to open its diff. A side panel tab collapses the panel when
// it is clicked while already the active tab, so this only clicks when the
// Agents view is not the visible one yet.
async function showAgentsView(): Promise<void> {
  if (!(await app.page.locator("#ai1-agents").isVisible())) {
    await app.page.locator("#shell-tab-ai1-agents").click();
  }
}

test("the Agents view is in the right panel", async () => {
  await showAgentsView();
  await expect(app.page.locator("#theia-right-side-panel #ai1-agents")).toBeVisible();
});

test("the Agents view lists the fixture session under its repository", async () => {
  await showAgentsView();
  const group = app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" });
  await expect(group).toBeVisible();
  // A group with no working or blocked session starts collapsed, so its
  // session card is not in the tree until the group expands.
  const card = app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" });
  if (!(await card.isVisible())) {
    await group.click();
  }
  await expect(card).toBeVisible();
});

test("a click on a session card opens its terminal in the center", async () => {
  await app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" }).click();
  const tab = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", {
    hasText: "OC · ai1-e2e-session",
  });
  await expect(tab).toBeVisible();
  await expect(app.page.locator("#theia-main-content-panel .xterm")).toBeVisible();
});

test("a second click focuses the same terminal", async () => {
  await app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "OC · ai1-e2e-session" }),
  ).toHaveCount(1);
});

test("a persistent terminal creates a tmux session", async () => {
  await app.quickCommandPalette.type("New Persistent Terminal");
  await app.page
    .locator(".quick-input-widget .monaco-list-row", { hasText: "New Persistent Terminal" })
    .click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "dirty-repo" }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · dirty-repo" }),
  ).toBeVisible();
  await expect.poll(() => execFileSync("tmux", ["ls"], { encoding: "utf8" })).toContain("ai1-");
});
