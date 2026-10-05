import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { clickTab } from "./click-tab";
import { removeTempDir } from "./remove-temp-dir";

const preference = "ai1.changes.repositoryScanDepth";

function createWorkspace(root: string, name: string): string {
  const workspace = path.join(root, name);
  fs.mkdirSync(path.join(workspace, ".theia"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".theia/settings.json"), JSON.stringify({ "editor.tabSize": 2 }));
  for (const relative of ["", "child", "railgun/reloaded/project"]) {
    const repository = path.join(workspace, relative);
    fs.mkdirSync(repository, { recursive: true });
    const file = path.join(repository, "file.ts");
    fs.writeFileSync(file, "export const value = 1;\n");
    if (!relative) fs.writeFileSync(path.join(repository, ".gitignore"), ".theia/\nchild/\nrailgun/\n");
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-C",
          repository,
          "-c",
          "commit.gpgsign=false",
          "-c",
          "user.name=AI1 Test",
          "-c",
          "user.email=test@ai1.invalid",
          ...args,
        ],
        { stdio: "pipe" },
      );
    git("init", "--quiet", "--initial-branch=main");
    git("add", ".");
    git("commit", "--quiet", "-m", "Add fixture");
    fs.writeFileSync(file, "export const value = 2;\n");
  }
  return workspace;
}

test("Changes settings save profile defaults and optional workspace overrides", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-settings-")));
  const workspace = createWorkspace(root, "code");
  const otherWorkspace = createWorkspace(root, "other-code");
  const config = path.join(root, "config/settings.json");
  const workspaceConfig = path.join(workspace, ".theia/settings.json");
  fs.mkdirSync(path.join(root, "config"));
  fs.mkdirSync(path.join(root, "home"));
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ "ai1.welcome.startup": "never", "files.autoSave": "off" }));
  const server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let app: TheiaApp;
  const launch = async (folder: string) => {
    running = await electron.launch({
      executablePath: process.env.AI1_E2E_EXECUTABLE,
      args: [
        ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
        "--no-sandbox",
        "--no-cluster",
        `--app-project-path=${application}`,
        `--user-data-dir=${root}/userdata`,
        `--electronUserData=${root}/userdata`,
        folder,
      ],
      env: {
        ...process.env,
        HOME: path.join(root, "home"),
        THEIA_CONFIG_DIR: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
        TMUX_TMPDIR: root,
        TMUX: "",
      },
    });
    const opened = new TheiaApp(await running.firstWindow(), new TheiaWorkspace(), true);
    await opened.waitForShellAndInitialized();
    if (!(await opened.page.locator("#ai1-changes").isVisible()))
      await clickTab(opened.page.locator("#shell-tab-ai1-changes"));
    await opened.page.keyboard.press(process.platform === "darwin" ? "Meta+Control+c" : "Control+Shift+c");
    await expect(opened.page.getByRole("button", { name: "Changes settings", exact: true })).toBeVisible();
    return opened;
  };
  const quit = async () => {
    const closed = running!.waitForEvent("close");
    await running!.evaluate(({ app }) => app.quit());
    await closed;
    running = undefined;
  };
  const names = () => app.page.locator("#ai1-changes .ai1-changes-repo .ai1-changes-name");
  const settings = async (
    scope: "App profile" | "This workspace",
    label: string,
    setting = "Repository search depth",
  ) => {
    await app.page.getByRole("button", { name: "Changes settings", exact: true }).click();
    await expect(app.page.getByRole("textbox", { name: "Changes settings", exact: true })).toBeFocused();
    await app.page.locator(".quick-input-widget").getByText(setting, { exact: true }).click();
    await expect(
      app.page.getByRole("textbox", { name: "Changes settings scope", exact: true }),
    ).toBeFocused();
    await app.page.locator(".quick-input-widget").getByText(scope, { exact: true }).click();
    await expect(
      app.page.getByRole("textbox", {
        name: setting === "Refresh mode" ? "Changes refresh mode" : "Repository search depth",
        exact: true,
      }),
    ).toBeFocused();
    await app.page.locator(".quick-input-widget").getByText(label, { exact: true }).click();
  };
  const saved = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    app = await launch(workspace);
    await expect(names()).toHaveText(["child", "code", "railgun/reloaded/project"]);
    await settings("App profile", "Direct children");
    await expect(names()).toHaveText(["child", "code"]);
    expect(saved(config)[preference]).toBe(1);
    expect(saved(config)["files.autoSave"]).toBe("off");
    await settings("App profile", "Current folder only");
    await expect(names()).toHaveText(["code"]);
    await settings("App profile", "Custom depth…");
    const input = app.page.getByRole("textbox", { name: "Custom repository search depth", exact: true });
    await input.fill("1.5");
    await input.press("Enter");
    await expect(input).toBeFocused();
    expect(saved(config)[preference]).toBe(0);
    await expect(app.page.locator(".quick-input-widget")).toContainText("Enter a non-negative whole number.");
    await input.fill("3");
    await input.press("Enter");
    await expect(names()).toHaveText(["child", "code", "railgun/reloaded/project"]);
    expect(saved(config)[preference]).toBe(3);
    await settings("App profile", "Custom depth…");
    await input.fill("0");
    await app.page.keyboard.press("Escape");
    await expect(app.page.locator(".quick-input-widget")).toBeHidden();
    expect(saved(config)[preference]).toBe(3);
    await settings("This workspace", "Current folder only");
    await expect(names()).toHaveText(["code"]);
    expect(saved(workspaceConfig)[preference]).toBe(0);
    expect(saved(workspaceConfig)["editor.tabSize"]).toBe(2);
    expect(saved(config)[preference]).toBe(3);
    await settings("App profile", "Direct children");
    await expect.poll(() => saved(config)[preference]).toBe(1);
    expect(saved(workspaceConfig)[preference]).toBe(0);
    await expect(names()).toHaveText(["code"]);
    await quit();
    app = await launch(otherWorkspace);
    await expect(names()).toHaveText(["child", "other-code"]);
    expect(saved(path.join(otherWorkspace, ".theia/settings.json"))[preference]).toBeUndefined();
    await quit();
    app = await launch(workspace);
    await expect(names()).toHaveText(["code"]);
    await settings("This workspace", "Use app profile");
    await expect(names()).toHaveText(["child", "code"]);
    expect(saved(workspaceConfig)[preference]).toBeUndefined();
    expect(saved(workspaceConfig)["editor.tabSize"]).toBe(2);
    await settings("App profile", "All levels");
    await expect(names()).toHaveText(["child", "code", "railgun/reloaded/project"]);
    await settings("App profile", "Manual", "Refresh mode");
    await expect.poll(() => saved(config)["ai1.changes.refreshMode"]).toBe("manual");
    await quit();
    app = await launch(workspace);
    await expect(names()).toHaveText(["child", "code", "railgun/reloaded/project"]);
    const refreshStatus = app.page.locator("#ai1-changes .ai1-changes-refresh-status");
    await expect(refreshStatus).toContainText("Last refreshed");
    await expect(refreshStatus).toContainText("Manual");
    const lastRefresh = await refreshStatus.locator("[title]").getAttribute("title");
    fs.writeFileSync(path.join(workspace, "manual-only.ts"), "export {};\n");
    await app.page.waitForTimeout(1200);
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "manual-only.ts" }),
    ).toHaveCount(0);
    await expect(refreshStatus).toContainText("Changes may be out of date");
    await expect(refreshStatus.locator("[title]")).toHaveAttribute("title", lastRefresh!);
    await app.page.locator('[id="ai1.changes.refresh"]').click();
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "manual-only.ts" }),
    ).toBeVisible();
    await expect(refreshStatus).not.toContainText("Changes may be out of date");
    await expect(refreshStatus.locator("[title]")).not.toHaveAttribute("title", lastRefresh!);
    await settings("App profile", "Automatic", "Refresh mode");
    await expect.poll(() => saved(config)["ai1.changes.refreshMode"]).toBe("automatic");
    fs.writeFileSync(path.join(workspace, "automatic.ts"), "export {};\n");
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "automatic.ts" }),
    ).toBeVisible();
    await clickTab(app.page.locator("#shell-tab-ai1-changes"));
    await expect(app.page.locator("#ai1-changes")).toBeHidden();
    fs.writeFileSync(path.join(workspace, "hidden-automatic.ts"), "export {};\n");
    await app.page.waitForTimeout(1200);
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "hidden-automatic.ts" }),
    ).toHaveCount(0);
    await clickTab(app.page.locator("#shell-tab-ai1-changes"));
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "hidden-automatic.ts" }),
    ).toBeVisible();
    await settings("This workspace", "Manual", "Refresh mode");
    await expect.poll(() => saved(workspaceConfig)["ai1.changes.refreshMode"]).toBe("manual");
    expect(saved(config)["ai1.changes.refreshMode"]).toBe("automatic");
    fs.writeFileSync(path.join(workspace, "workspace-manual.ts"), "export {};\n");
    await app.page.waitForTimeout(1200);
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "workspace-manual.ts" }),
    ).toHaveCount(0);
    await settings("This workspace", "Use app profile", "Refresh mode");
    await expect(
      app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "workspace-manual.ts" }),
    ).toBeVisible();
    expect(saved(workspaceConfig)["ai1.changes.refreshMode"]).toBeUndefined();
  } finally {
    await running?.close();
    await server.stop();
    await removeTempDir(root);
  }
});
