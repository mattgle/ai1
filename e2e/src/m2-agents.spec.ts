import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { BrowserFixtureServer } from "./browser-fixture-server";
import { clickTab } from "./click-tab";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { openBrowserTab } from "./open-browser-tab";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;
let sessionId: string;
let dirtyRepo: string;
let preexistingTmuxSessions: string[];
let browserFixture: BrowserFixtureServer;

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

// Polls `GET /api/session/:id/permission` until a request is pending, and
// returns its id. Called right after the permission-creating request is
// sent, before any UI assertion, so a `finally` block always has a real
// id to reply to -- otherwise, if a later UI assertion timed out before the
// code would otherwise have queried for the id, the request could be left
// open in the owner's real OpenCode service.
async function waitForPendingPermissionId(id: string, timeoutMs = 10_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const raw = execFileSync("opencode", ["api", "GET", `/api/session/${id}/permission`], {
      encoding: "utf8",
    });
    const pending = JSON.parse(raw).data as { id: string }[];
    if (pending[0]) {
      return pending[0].id;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`no permission request appeared for session ${id} within ${timeoutMs}ms`);
}

// Replies "reject" to every permission request still pending for `id`.
// Called unconditionally from a `finally` block: after a successful reply
// in the try block this finds nothing pending (a no-op); after a failed
// assertion it finds the one `waitForPendingPermissionId` returned, and
// replies to it, so a probe permission request never lingers in the
// owner's real OpenCode service.
function replyToAllPending(id: string): void {
  let pending: { id: string }[];
  try {
    const raw = execFileSync("opencode", ["api", "GET", `/api/session/${id}/permission`], {
      encoding: "utf8",
    });
    pending = JSON.parse(raw).data as { id: string }[];
  } catch (error) {
    // A throw here would hide the test's own failure.
    console.warn(`could not list the pending permissions of ${id}: ${String(error)}`);
    return;
  }
  for (const item of pending) {
    try {
      execFileSync("opencode", [
        "api",
        "POST",
        `/api/session/${id}/permission/${item.id}/reply`,
        "--data",
        JSON.stringify({ decision: "reject" }),
      ]);
    } catch (error) {
      console.warn(`could not reply to permission request '${item.id}':`, error);
    }
  }
}

test.beforeAll(async ({ playwright, browser }) => {
  preexistingTmuxSessions = listAi1TmuxSessions();
  // The application must not write into the real settings folder of the
  // machine during a test run. Playwright's Electron launch inherits the
  // runner's environment, so this folder becomes the app's settings folder.
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  // Electron's own user-data folder (its default is the real `AI1` folder
  // under the machine's application support directory) holds the workbench
  // layout; two launch flags redirect it fully. See the same setup in
  // `m1-smoke.spec.ts` for why both are needed.
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  browserFixture = new BrowserFixtureServer();
  await browserFixture.start();
  // OpenCode stores `location.directory` verbatim, with no resolution of
  // its own. The Electron main process, on its side, resolves the
  // workspace path with `fs.realpath` before it opens the window
  // (`electron-main-application.ts`), so on a system where the temporary
  // folder is a symlink (`/var` on macOS) the running app's workspace root
  // is already the resolved path. This directory must equal that resolved
  // root, or the Agents service filters the session out of every group.
  // `AgentsServiceImpl.normalizeRoot`'s own `fs.realpathSync` call resolves
  // symbolic links on the root's side of that comparison, for a root a
  // real deployment might hand it unresolved; it does not touch this
  // session directory, the other side of the comparison, so this
  // resolution still belongs here.
  dirtyRepo = path.join(fs.realpathSync(workspace.path), "dirty-repo");
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
    {
      playwright,
      browser,
      useElectron: {
        launchOptions: {
          additionalArgs: [
            "--no-sandbox",
            "--no-cluster",
            `--user-data-dir=${userDataDir}`,
            `--electronUserData=${userDataDir}`,
          ],
          electronAppPath,
          pluginsPath,
        },
      },
    },
    workspace,
  );
});

test.afterAll(async () => {
  try {
    await app?.page.close();
    if (sessionId) {
      execFileSync("opencode", ["api", "DELETE", `/api/session/${sessionId}`]);
    }
    // The "New Session" test (criterion 3) creates further sessions in the
    // fixture's own dirty-repo directory. `directory=` is meant to be an
    // exact match against a session's own `location.directory`, verified
    // live (a parent or a sibling directory gave no match) -- but a
    // server-side filter is never trusted alone for a delete against the
    // owner's real data: skip this whole block if the fixture directory
    // was never set (a failure earlier in `beforeAll`, before the
    // assignment), and, for each session the listing returns, check its
    // own `location.directory` from the response body and delete it only
    // when that field equals `dirtyRepo` exactly. A filter that silently
    // matched more than the exact directory (a bug, a future API change,
    // a prefix match, ...) can then never delete a session of a different
    // directory -- including one of the owner's own.
    if (dirtyRepo) {
      try {
        const raw = execFileSync(
          "opencode",
          ["api", "GET", `/api/session?directory=${encodeURIComponent(dirtyRepo)}`],
          { encoding: "utf8" },
        );
        const remaining = JSON.parse(raw).data as { id: string; location?: { directory?: string } }[];
        for (const session of remaining) {
          if (session.location?.directory !== dirtyRepo) {
            console.warn(
              `skipped session '${session.id}': its own directory '${session.location?.directory}' does not equal the fixture directory '${dirtyRepo}' exactly`,
            );
            continue;
          }
          try {
            execFileSync("opencode", ["api", "DELETE", `/api/session/${session.id}`]);
          } catch (error) {
            console.warn(`could not delete session '${session.id}':`, error);
          }
        }
      } catch (error) {
        console.warn(`could not list the sessions of '${dirtyRepo}':`, error);
      }
    }
    // Kill only the ai1-* tmux sessions this test made, never one that
    // existed before it (the owner's own sessions). Each kill is its own
    // try/catch, so one failure does not stop the rest of the cleanup.
    for (const name of listAi1TmuxSessions()) {
      if (!preexistingTmuxSessions.includes(name)) {
        try {
          execFileSync("tmux", ["kill-session", "-t", name]);
        } catch (error) {
          console.warn(`could not kill tmux session '${name}':`, error);
        }
      }
    }
  } finally {
    await browserFixture?.stop();
    fs.rmSync(configDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
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
    await clickTab(app.page.locator("#shell-tab-ai1-agents"));
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
    hasText: "sh · ai1-e2e-session",
  });
  await expect(tab).toBeVisible();
  await expect(app.page.locator("#theia-main-content-panel .xterm")).toBeVisible();
});

test("a second click focuses the same terminal", async () => {
  await app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" }).click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · ai1-e2e-session" }),
  ).toHaveCount(1);
});

// Exactly one session shell is open at this point.
// at this point (the fixture session's own, opened by the two tests
// above), so `before` below is a known quantity, not just "whatever the
// suite happened to leave open" -- and no later test opens a further
// OpenCode interface tab, so this session's own tab is the only one that
// count still includes for the rest of the suite.
test("New Session creates a session in the picked repository and opens it", async () => {
  await showAgentsView();
  const tabs = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · " });
  const before = await tabs.count();
  expect(before).toBe(1);
  const group = app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" });
  const groupRow = group.locator("xpath=ancestor::div[contains(@class,'theia-TreeNode')][1]");
  const badgeBefore = Number(await groupRow.locator(".ai1-agents-badge").innerText());

  await app.quickCommandPalette.type("Agents: New Session");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "New Session" }).click();
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "dirty-repo" }).click();

  await expect(tabs).toHaveCount(before + 1);
  await expect(groupRow.locator(".ai1-agents-badge")).toHaveText(String(badgeBefore + 1));
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

test("a prompt moves the card to working and then to done", async () => {
  await showAgentsView();
  const card = app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" });
  const row = card.locator("xpath=ancestor::div[contains(@class,'theia-TreeNode')][1]");
  execFileSync(
    "opencode",
    [
      "api",
      "POST",
      `/api/session/${sessionId}/prompt`,
      "--data",
      JSON.stringify({ text: "Reply with the single word ok." }),
    ],
    { cwd: dirtyRepo },
  );
  // The two inner timeouts must fit inside the Playwright test timeout
  // (120_000, playwright.config.ts) with margin, or a genuinely slow run
  // times out at the outer level with a less clear failure.
  await expect(row.locator(".ai1-agents-status-working")).toBeVisible({ timeout: 20_000 });
  await expect(row.locator(".ai1-agents-status-done")).toBeVisible({ timeout: 80_000 });
});

test("Design Mode sends drawn feedback and its screenshot to the chosen agent session", async () => {
  const designSession = JSON.parse(
    execFileSync(
      "opencode",
      [
        "api",
        "POST",
        "/api/session",
        "--data",
        JSON.stringify({ title: "ai1-e2e-design-mode-session", location: { directory: dirtyRepo } }),
      ],
      { cwd: dirtyRepo, encoding: "utf8" },
    ),
  ).data as { id: string };
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

    const raw = execFileSync(
      "opencode",
      ["api", "GET", `/api/session/${designSession.id}/message?limit=10&order=desc`],
      { cwd: dirtyRepo, encoding: "utf8" },
    );
    const messages = JSON.parse(raw).data as unknown[];
    const sentMessage = JSON.stringify(messages);
    expect(sentMessage).toContain("Move this button down.");
    expect(sentMessage).toContain("browser-selection-1.png");
  } finally {
    execFileSync("opencode", ["api", "DELETE", `/api/session/${designSession.id}`], { cwd: dirtyRepo });
  }
});

test("a session that waits for a permission shows a notice and a badge", async () => {
  await showAgentsView();
  // `POST /api/session/:id/permission` returns at once and leaves the request
  // pending. The `finally` block below always replies to any request still
  // pending (or, if the try block's own reply already went out, does nothing).
  execFileSync(
    "opencode",
    [
      "api",
      "POST",
      `/api/session/${sessionId}/permission`,
      "--data",
      JSON.stringify({ action: "external_directory", resources: ["/etc/x/*"] }),
    ],
    { cwd: dirtyRepo, stdio: "ignore", timeout: 10_000 },
  );
  // Toasts and the notification center render the same notice twice in the
  // DOM (`NotificationComponent`, reused by both); scoping to the open
  // toasts container picks the one that is actually visible right now.
  const notice = app.page.locator(".theia-notification-toasts.open .theia-notification-list-item", {
    hasText: "waits for a permission",
  });
  const badge = app.page.locator("#shell-tab-ai1-agents .theia-badge-decorator-sidebar");
  try {
    const requestId = await waitForPendingPermissionId(sessionId);
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice.locator("button.theia-button", { hasText: "Open" })).toBeVisible();
    await expect(badge).toHaveText("1");

    execFileSync("opencode", [
      "api",
      "POST",
      `/api/session/${sessionId}/permission/${requestId}/reply`,
      "--data",
      JSON.stringify({ decision: "reject" }),
    ]);

    await expect(notice).toHaveCount(0, { timeout: 30_000 });
    await expect(badge).toHaveCount(0);
  } finally {
    replyToAllPending(sessionId);
  }
});

test("closing and reopening the Agents view keeps the card callbacks and the badge working", async () => {
  await showAgentsView();
  // A side-panel tab has no inline close icon (`theia-app-sides
  // .lm-TabBar-tabCloseIcon { display: none }`). The palette's "Close Tab"
  // command acts on `ApplicationShell.currentTabBar`/`currentTitle`
  // (`CurrentWidgetCommandAdapter`'s fallback when its triggering event has
  // no tab-bar DOM target, `application-shell.ts`'s `findTabBar`/
  // `findTitle`), which by this point in the suite is a main-area terminal
  // tab, not the Agents tab, so it closes the wrong one. The tab's own
  // right-click "Close" targets the exact tab the click landed on instead
  // (the same adapter, but its event now DOES have that tab as its DOM
  // target), which is what a real user would do to close a side-panel view.
  await clickTab(app.page.locator("#shell-tab-ai1-agents"), { button: "right" });
  await app.page.locator(".lm-Menu-item", { hasText: /^Close$/ }).click();
  await expect(app.page.locator("#ai1-agents")).toHaveCount(0);

  // Reopens it with its own toggle command (`AbstractViewContribution`'s
  // default label, "Toggle {viewName}"); `WidgetManager` makes a fresh
  // `AgentsWidget` instance for it, a different object than the one the
  // suite's earlier tests used.
  await app.quickCommandPalette.type("Toggle Agents");
  await app.page.locator(".quick-input-widget .monaco-list-row", { hasText: "Toggle Agents" }).click();
  await expect(app.page.locator("#theia-right-side-panel #ai1-agents")).toBeVisible();

  // The card callbacks on the new instance: a click on the fixture card
  // still opens (or focuses) its terminal.
  const card = app.page.locator("#ai1-agents .ai1-agents-card", { hasText: "ai1-e2e-session" });
  if (!(await card.isVisible())) {
    // A fresh widget instance starts with no saved expansion state, and by
    // this point in the suite the fixture session is no longer `working`
    // or `blocked` (the earlier prompt test already moved it to `done`),
    // so its group starts collapsed again.
    await app.page.locator("#ai1-agents .ai1-agents-group", { hasText: "dirty-repo" }).click();
  }
  await card.click();
  await expect(
    app.page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sh · ai1-e2e-session" }),
  ).toBeVisible();

  // The badge on the new tab, with the same real-permission pattern as the
  // notice test above.
  execFileSync(
    "opencode",
    [
      "api",
      "POST",
      `/api/session/${sessionId}/permission`,
      "--data",
      JSON.stringify({ action: "external_directory", resources: ["/etc/w/*"] }),
    ],
    { cwd: dirtyRepo, stdio: "ignore", timeout: 10_000 },
  );
  const badge = app.page.locator("#shell-tab-ai1-agents .theia-badge-decorator-sidebar");
  try {
    const requestId = await waitForPendingPermissionId(sessionId);
    await expect(badge).toHaveText("1", { timeout: 30_000 });
    execFileSync("opencode", [
      "api",
      "POST",
      `/api/session/${sessionId}/permission/${requestId}/reply`,
      "--data",
      JSON.stringify({ decision: "reject" }),
    ]);
    await expect(badge).toHaveCount(0);
  } finally {
    replyToAllPending(sessionId);
  }
});

test("a real permission request still shows a notice while the Agents view is closed", async () => {
  // Close the tab itself (not just switch away from it, which the Agents
  // view already tolerates by design): `AgentsWidget` is disposed, so the
  // event stream and the notice can only still work because
  // `AgentsContribution.onStart` loads the model on its own, independent of
  // the widget's own `init()`.
  await showAgentsView();
  await clickTab(app.page.locator("#shell-tab-ai1-agents"), { button: "right" });
  await app.page.locator(".lm-Menu-item", { hasText: /^Close$/ }).click();
  await expect(app.page.locator("#ai1-agents")).toHaveCount(0);

  execFileSync(
    "opencode",
    [
      "api",
      "POST",
      `/api/session/${sessionId}/permission`,
      "--data",
      JSON.stringify({ action: "external_directory", resources: ["/etc/y/*"] }),
    ],
    { cwd: dirtyRepo, stdio: "ignore", timeout: 10_000 },
  );
  const notice = app.page.locator(".theia-notification-toasts.open .theia-notification-list-item", {
    hasText: "waits for a permission",
  });
  try {
    const requestId = await waitForPendingPermissionId(sessionId);
    await expect(notice).toBeVisible({ timeout: 30_000 });
    execFileSync("opencode", [
      "api",
      "POST",
      `/api/session/${sessionId}/permission/${requestId}/reply`,
      "--data",
      JSON.stringify({ decision: "reject" }),
    ]);
    await expect(notice).toHaveCount(0, { timeout: 30_000 });
  } finally {
    replyToAllPending(sessionId);
  }
});
