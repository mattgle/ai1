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

test.beforeAll(async ({ playwright, browser }) => {
  // The application must not write into the real settings folder of the
  // machine during a test run. Playwright's Electron launch inherits the
  // runner's environment, so this folder becomes the app's settings folder.
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  // The Electron main process resolves the workspace path with `fs.realpath`
  // before it opens the window (`electron-main-application.ts`), so on a
  // system where the temporary folder is a symlink (`/var` on macOS) the
  // running app's workspace root is the resolved path, not the raw one.
  // The session directory must match the resolved root, or the Agents
  // service filters the session out of every group.
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
