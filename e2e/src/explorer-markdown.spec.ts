import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";
import { clickTab } from "./click-tab";

let root: string;
let workspace: string;
let server: FakeOpenCodeServer;
let running: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;

test.beforeEach(async () => {
  const temporary = path.join(os.tmpdir(), "opencode");
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.realpathSync(fs.mkdtempSync(path.join(temporary, "ai1-explorer-markdown-")));
  workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(workspace, "folder"));
  fs.mkdirSync(path.join(root, "config"));
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
  fs.writeFileSync(path.join(workspace, "first.md"), "# First independent preview\n");
  fs.writeFileSync(path.join(workspace, "second.md"), "# Second independent preview\n");
  server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  running = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${application}`,
      `--user-data-dir=${root}/userdata`,
      `--electronUserData=${root}/userdata`,
      workspace,
    ],
    env: {
      ...process.env,
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
      TMUX_TMPDIR: root,
      TMUX: "",
    },
  });
  app = new TheiaApp(await running.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
});

test.afterEach(async () => {
  if (test.info().status !== test.info().expectedStatus) {
    await running
      ?.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => undefined);
  }
  await running?.close();
  await server?.stop();
  await removeTempDir(root);
});

test("Enter renames the selected Explorer file on macOS", async () => {
  test.skip(process.platform !== "darwin");
  const page = app.page;
  const file = page.locator("#files .theia-TreeNode", { hasText: "first.md" });
  await file.dblclick();
  await expect(page.getByRole("textbox", { name: "Editor content", exact: true })).toBeFocused();
  await page.locator("#files").focus();
  await expect
    .poll(() => page.locator("#files").evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Enter");
  const dialog = page.locator(".dialogBlock");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog).toContainText("Rename");
  await dialog.getByRole("textbox").fill("renamed.md");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(() => fs.existsSync(path.join(workspace, "renamed.md"))).toBe(true);
  expect(fs.existsSync(path.join(workspace, "first.md"))).toBe(false);
  expect(fs.readFileSync(path.join(workspace, "renamed.md"), "utf8")).toBe("# First independent preview\n");

  const renamed = page.locator("#files .theia-TreeNode", { hasText: "renamed.md" });
  await renamed.click();
  await page.locator("#files").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("textbox")).toHaveValue("renamed.md");
  await dialog.getByRole("textbox").fill("cancelled.md");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(fs.existsSync(path.join(workspace, "cancelled.md"))).toBe(false);

  await page.locator("#files .theia-TreeNode", { hasText: /^folder$/ }).click();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("textbox")).toHaveValue("folder");
  await dialog.getByRole("textbox").fill("renamed-folder");
  await page.keyboard.press("Enter");
  await expect.poll(() => fs.existsSync(path.join(workspace, "renamed-folder"))).toBe(true);

  await renamed.dblclick();
  await expect(page.getByRole("textbox", { name: "Editor content", exact: true })).toBeFocused();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Meta+s");
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => fs.readFileSync(path.join(workspace, "renamed.md"), "utf8"))
    .toBe("# First independent preview\n\n");
});

for (const route of ["palette", "side", "Explorer menu"] as const) {
  test(`Markdown files keep separate preview tabs through ${route}`, async () => {
    const page = app.page;
    const tabs = page.locator("#theia-main-content-panel .lm-TabBar-tab");
    const preview = (file: string) =>
      tabs.filter({ hasText: new RegExp(`\\[?Preview\\]? ${file.replace(".", "\\.")}`) });
    if (route === "Explorer menu") {
      await running.evaluate(({ Menu }) => {
        Menu.prototype.popup = function () {
          (globalThis as typeof globalThis & { previewMenu?: Electron.Menu }).previewMenu = this;
        };
      });
    }
    const openPreview = async (file: string) => {
      if (route === "Explorer menu") {
        await running.evaluate(() => {
          (globalThis as typeof globalThis & { previewMenu?: Electron.Menu }).previewMenu = undefined;
        });
        await page.locator("#files .theia-TreeNode", { hasText: file }).click({ button: "right" });
        await expect
          .poll(() =>
            running.evaluate(
              () => !!(globalThis as typeof globalThis & { previewMenu?: Electron.Menu }).previewMenu,
            ),
          )
          .toBe(true);
        await running.evaluate(({ BrowserWindow }) => {
          const menu = (globalThis as typeof globalThis & { previewMenu?: Electron.Menu }).previewMenu!;
          const item = menu.items.find((entry) => entry.label === "Open Preview");
          if (!item?.enabled) throw new Error("Open Preview is missing or disabled");
          item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
        });
      } else {
        await app.quickCommandPalette.trigger(
          route === "side" ? "Markdown: Open Preview to the Side" : "Markdown: Open Preview",
        );
      }
      await expect(preview(file)).toHaveCount(1);
    };
    const hasHeading = async (heading: string) => {
      for (const frame of page.frames()) {
        if (await frame.getByRole("heading", { name: heading, exact: true }).isVisible()) return true;
      }
      return false;
    };
    for (const file of ["first.md", "second.md"]) {
      await page.locator("#files .theia-TreeNode", { hasText: file }).dblclick();
      await openPreview(file);
    }
    await expect(preview("first.md")).toHaveCount(1, { timeout: 5000 });
    await expect(preview("second.md")).toHaveCount(1);
    for (const [file, heading] of [
      ["first.md", "First independent preview"],
      ["second.md", "Second independent preview"],
    ]) {
      await clickTab(preview(file));
      await expect.poll(() => hasHeading(heading)).toBe(true);
    }
    const firstId = await preview("first.md").getAttribute("id");
    await clickTab(tabs.filter({ has: page.locator(".lm-TabBar-tabLabel", { hasText: /^first\.md$/ }) }));
    await openPreview("first.md");
    await expect(preview("first.md")).toHaveAttribute("id", firstId!);
    await expect(preview("second.md")).toHaveCount(1);

    fs.writeFileSync(path.join(workspace, "first.md"), "# Updated first preview\n");
    await clickTab(preview("first.md"));
    await expect.poll(() => hasHeading("Updated first preview")).toBe(true);
    await preview("first.md").locator(".lm-TabBar-tabCloseIcon").click();
    await expect(preview("first.md")).toHaveCount(0);
    await clickTab(preview("second.md"));
    await expect.poll(() => hasHeading("Second independent preview")).toBe(true);
  });
}
