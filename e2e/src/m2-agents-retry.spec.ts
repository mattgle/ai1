import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { removeTempDir } from "./remove-temp-dir";

// Proves gap 1 of the M2 error-table cleanup (see
// `.superpowers/sdd/2026-09-23-ai1-m2-backlog/progress.md`, item 3): the
// Agents view shows a Retry button on a load error, and a click on it runs
// a fresh load through the same gated path as the Refresh command
// (`AgentsContribution.refresh()`), with its own catch.
//
// This never touches the owner's real OpenCode service. A fake `opencode`
// executable, placed ahead of the real one on `PATH` for this test's own
// Electron process only, always fails, so AI1's own backend never execs
// the real `opencode` binary, never runs `opencode service status`, and
// never reads the owner's real `~/.config/opencode/service.json`.
//
// Getting the fake binary onto `PATH` for only this one process is not as
// simple as passing `env: { PATH: ... }` to Playwright's own
// `electron.launch`: AI1's generated `electron-main.js` calls `fix-path`'s
// `fixPath()` unconditionally, as the very first line of its startup,
// before any Theia or AI1 code runs (macOS GUI apps do not inherit a
// shell's `PATH`, and this is Theia's own fix for that, upstream of
// anything this project controls). `fixPath()` replaces
// `process.env.PATH` with a fresh value from the real login shell
// (`shell-env`'s `shellPathSync`, spawning `$SHELL -ilc ...`), discarding
// whatever `PATH` this file's own `env` option set. That login shell,
// though, still honors `$ZDOTDIR` for zsh's own dotfile search (verified
// directly: `ZDOTDIR=<dir> /bin/zsh -ilc 'which opencode'` resolves to a
// fake `opencode` placed by a `.zshenv` under `<dir>`, and so does
// `shell-path`'s own `shellPathSync()` called the same way `fixPath()`
// calls it) -- so this file sets `ZDOTDIR` instead, pointing at a
// throwaway directory with its own `.zshenv` that puts the fake `opencode`
// ahead of the real one. `.zshenv` specifically, because zsh reads it for
// every invocation (interactive or not, login or not), unlike `.zprofile`
// or `.zshrc`.

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

// `TheiaAppLoader.load`'s own `useElectron.launchOptions`, when it carries
// both `additionalArgs` and `electronAppPath` (the shape every other M2
// spec in this suite uses), is rebuilt into a plain `{ args }` object
// before it reaches Playwright's own `electron.launch` --
// `toPlaywrightOptions` in `@theia/playwright`'s `theia-app-loader.js`
// keeps only `args`, silently dropping every other key, including `env`.
// So this file launches Electron directly and passes `env` itself, the
// same way `m2-agents-restart.spec.ts` already launches directly for its
// own, different reason.
async function launchApp(workspacePath: string, userDataDir: string, env: Record<string, string>) {
  const electronApp = await electron.launch({
    args: [
      electronAppPath,
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${electronAppPath}`,
      `--plugins=local-dir:${pluginsPath}`,
      `--user-data-dir=${userDataDir}`,
      `--electronUserData=${userDataDir}`,
      workspacePath,
    ],
    env,
  });
  const page = await electronApp.firstWindow();
  const app = new TheiaApp(page, new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  return { app, electronApp };
}

let configDir: string;
let userDataDir: string;
let fakeBinDir: string;
let zdotDir: string;
let logFile: string;
let app: TheiaApp;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-retry-config-"));
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-retry-userdata-"));

  // The fake `opencode`: it logs every call (so the test can tell a Retry
  // click made a fresh one) and always fails, the same as a machine with no
  // OpenCode service running at all.
  fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-retry-bin-"));
  logFile = path.join(fakeBinDir, "calls.log");
  fs.writeFileSync(logFile, "");
  const fakeOpencode = path.join(fakeBinDir, "opencode");
  fs.writeFileSync(
    fakeOpencode,
    [
      "#!/bin/sh",
      `echo "$@" >> "${logFile}"`,
      'echo "ai1-e2e-retry: no OpenCode service here" 1>&2',
      "exit 1",
      "",
    ].join("\n"),
  );
  fs.chmodSync(fakeOpencode, 0o755);

  // The throwaway `ZDOTDIR`: its `.zshenv` puts `fakeBinDir` ahead of the
  // real `PATH` for the login shell `fix-path` spawns (see the file
  // header comment). This never touches the owner's own dotfiles.
  zdotDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-retry-zdot-"));
  fs.writeFileSync(path.join(zdotDir, ".zshenv"), `export PATH="${fakeBinDir}:$PATH"\n`);

  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);

  // A filtered copy of the current environment: `process.env` can hold
  // `undefined` values, which Playwright's own `env` option does not
  // accept. `THEIA_CONFIG_DIR` keeps the app's settings folder out of the
  // real one, as every other e2e spec in this suite already does.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.THEIA_CONFIG_DIR = configDir;
  env.ZDOTDIR = zdotDir;

  const launch = await launchApp(workspace.path, userDataDir, env);
  app = launch.app;
  electronApp = launch.electronApp;
});

test.afterAll(async () => {
  try {
    await electronApp.close();
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
    fs.rmSync(zdotDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
  }
});

function fakeOpencodeCallCount(): number {
  return fs
    .readFileSync(logFile, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

test("the Agents view shows a Retry button on a load error, and Retry runs a fresh gated load", async () => {
  if (!(await app.page.locator("#ai1-agents").isVisible())) {
    await app.page.locator("#shell-tab-ai1-agents").click();
  }
  const error = app.page.locator("#ai1-agents .ai1-agents-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  // The fake `opencode` ran at least once already, for the view's own
  // first load.
  await expect.poll(fakeOpencodeCallCount).toBeGreaterThan(0);

  const retry = error.locator("button", { hasText: "Retry" });
  await expect(retry).toBeVisible();

  const callsBefore = fakeOpencodeCallCount();
  await retry.click();
  // The fake `opencode` never succeeds, so a fresh call to it, not a
  // stale, already-shown error, is the only proof a click on Retry ran a
  // new load.
  await expect.poll(fakeOpencodeCallCount, { timeout: 30_000 }).toBeGreaterThan(callsBefore);
  await expect(error).toBeVisible();
});
