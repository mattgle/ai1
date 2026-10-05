import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { clickTab } from "./click-tab";
import { removeTempDir } from "./remove-temp-dir";

let root: string;
let server: FakeOpenCodeServer;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;
const fileName = "YieldCalculator.module.scss";

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-layout-")));
  const workspace = path.join(root, "workspace");
  const repository = path.join(workspace, "railgun", "reloaded", "governance");
  const folder = path.join(repository, "src", "pages", "Admin", "YieldCalculator");
  const state = path.join(root, "state");
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(state, "opencode"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, target: "ES2020", lib: ["ES2020", "DOM"], types: [], noEmit: true },
      include: ["ShieldERC20sConfirm.tsx"],
    }),
  );
  fs.writeFileSync(
    path.join(workspace, "ShieldERC20sConfirm.tsx"),
    Array.from({ length: 7 }, (_, index) => `export const value${index}: number = 'invalid';`).join("\n"),
  );
  fs.writeFileSync(path.join(folder, fileName), ".page { color: red; }\n");
  fs.writeFileSync(path.join(folder, "routes.ts"), "export const value = 1;\n");
  execFileSync("git", ["init", repository], { stdio: "pipe" });
  execFileSync("git", ["-C", repository, "add", "."]);
  execFileSync(
    "git",
    [
      "-C",
      repository,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Add fixture",
    ],
    { stdio: "pipe" },
  );
  fs.writeFileSync(
    path.join(folder, fileName),
    "@use 'styles';\n$color: #fff;\n.page {\n  color: $color;\n  margin: 10px;\n}\n",
  );
  fs.writeFileSync(path.join(folder, "routes.ts"), "export const value = 2;\n");
  server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(state, "opencode", "service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
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
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: state,
      TMUX_TMPDIR: root,
      TMUX: "",
    },
  });
  app = new TheiaApp(await electronApp.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  if (!(await app.page.locator("#ai1-changes").isVisible())) {
    await clickTab(app.page.locator("#shell-tab-ai1-changes"));
  }
  await expect(app.page.locator("#ai1-changes")).toBeVisible();
  await expect(app.page.locator(".ai1-changes-file")).toHaveCount(2);
  const bounds = (await app.page.locator("#theia-right-side-panel").boundingBox())!;
  await app.page.mouse.move(bounds.x - 2, bounds.y + bounds.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(bounds.x - 2 - (280 - bounds.width), bounds.y + bounds.height / 2, { steps: 10 });
  await app.page.mouse.up();
});

test.afterAll(async () => {
  await electronApp?.close();
  await server?.stop();
  await removeTempDir(root);
});

test("Changes finds a deep repository and refreshes after a nested file save", async () => {
  const view = app.page.locator("#ai1-changes");
  await expect(view.locator(".ai1-changes-repo .ai1-changes-name")).toHaveText("railgun/reloaded/governance");
  const added = path.join(root, "workspace", "railgun", "reloaded", "governance", "new-nested-file.ts");
  fs.writeFileSync(added, "export const nested = true;\n");
  await expect(view.locator(".ai1-changes-file", { hasText: "new-nested-file.ts" })).toBeVisible();
  fs.unlinkSync(added);
  await expect(view.locator(".ai1-changes-file")).toHaveCount(2);
});

test("Changes hover actions do not overlap a long file name", async () => {
  const row = app.page.locator("#ai1-changes .theia-TreeNode", { hasText: fileName });
  await row.hover();
  const measurements = await row.evaluate((node) => {
    const name = node.querySelector(".ai1-changes-name")!.getBoundingClientRect();
    const tail = node.querySelector(".ai1-changes-tail")!.getBoundingClientRect();
    return { nameRight: name.right, tailLeft: tail.left };
  });
  expect(measurements.nameRight).toBeLessThanOrEqual(measurements.tailLeft);
  await expect(row.locator(".ai1-changes-name")).toHaveCSS("text-overflow", "ellipsis");
  await expect(row.locator(".ai1-changes-file")).toHaveAttribute(
    "title",
    `src/pages/Admin/YieldCalculator/${fileName}`,
  );
});

test("Changes rows keep their height and position when actions appear", async () => {
  const rows = app.page.locator("#ai1-changes .theia-TreeNode");
  const row = rows.filter({ hasText: fileName });
  await app.page.mouse.move(0, 0);
  const measure = () =>
    rows.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      }),
    );
  const before = await measure();
  await row.hover();
  const action = row.getByRole("button", { name: "Open File", exact: true });
  await expect(action).toBeVisible();
  expect(await measure()).toEqual(before);
  await action.focus();
  await app.page.mouse.move(0, 0);
  await expect(action).toBeVisible();
  expect(await measure()).toEqual(before);
  await app.page.locator("#theia-main-content-panel").click();
  if (process.env.AI1_CHANGES_SCREENSHOT) {
    await app.page.mouse.move(0, 0);
    await app.page.screenshot({ path: process.env.AI1_CHANGES_SCREENSHOT });
  }
});

test("Explorer uses rounded activity and file selection without an edge marker", async () => {
  const activity = app.page.locator("#shell-tab-explorer-view-container");
  if (!(await activity.getAttribute("class"))?.includes("lm-mod-current")) await clickTab(activity);
  await expect(activity).toHaveClass(/lm-mod-current/);
  await expect(activity).toHaveCSS("box-shadow", "none");
  const selection = await activity.evaluate((node) => {
    const style = getComputedStyle(node, "::before");
    return {
      width: style.width,
      height: style.height,
      radius: style.borderRadius,
      background: style.backgroundColor,
    };
  });
  expect(selection).toEqual({
    width: "32px",
    height: "32px",
    radius: "4px",
    background: "rgba(255, 255, 255, 0.13)",
  });
  const row = app.page.locator("#files .theia-TreeNode", { hasText: "tsconfig.json" });
  await row.click();
  await expect(row).toHaveClass(/theia-mod-selected/);
  await expect(row).toHaveCSS("border-radius", "4px");
  await expect(row).toHaveCSS("margin-left", "4px");
  await expect(row).toHaveCSS("margin-right", "4px");
  const height = (await row.boundingBox())!.height;
  await app.page.locator("#theia-main-content-panel").click();
  await expect(row).toHaveClass(/theia-mod-selected/);
  expect((await row.boundingBox())!.height).toBe(height);
  if (process.env.AI1_SELECTION_SCREENSHOT) {
    await app.page.mouse.move(0, 0);
    await app.page.screenshot({ path: process.env.AI1_SELECTION_SCREENSHOT });
  }
});

test("Diff tabs use the file-type icon instead of a split-panel icon", async () => {
  const row = app.page.locator("#ai1-changes .theia-TreeNode", { hasText: "routes.ts" });
  const expected = (await row.locator(".file-icon").getAttribute("class"))!
    .split(" ")
    .find((name) => name.startsWith("ai1-mi-"))!;
  expect(expected).toBeTruthy();
  await row.click();
  const tab = app.page.locator("#theia-main-content-panel .lm-TabBar-tab", {
    hasText: "routes.ts (HEAD ↔ Working)",
  });
  await expect(tab).toBeVisible();
  await expect(tab.locator(`.${expected}`)).toHaveCount(1);
  await expect(tab.locator(".codicon-split-horizontal")).toHaveCount(0);
});

test("SCSS editor shows distinct syntax colors", async () => {
  const row = app.page.locator("#ai1-changes .theia-TreeNode", { hasText: fileName });
  await row.hover();
  await row.locator('[title="Open File"]').click();
  const editor = app.page.locator("#theia-main-content-panel .monaco-editor:visible");
  await expect(editor).toHaveCount(1);
  await expect
    .poll(() =>
      editor
        .locator(".view-lines span[class^=mtk]")
        .evaluateAll(
          (nodes) =>
            new Set(
              nodes.filter((node) => node.textContent?.trim()).map((node) => getComputedStyle(node).color),
            ).size,
        ),
    )
    .toBeGreaterThanOrEqual(4);
});

test("Changes actions stay clear of names with keyboard focus in the light theme", async () => {
  const page = app.page;
  fs.writeFileSync(
    path.join(root, "config", "settings.json"),
    JSON.stringify({ "workbench.colorTheme": "light" }),
  );
  await expect(page.locator("body")).toHaveClass(/theia-light/);
  const row = page.locator("#ai1-changes .theia-TreeNode", { hasText: fileName });
  await row.hover();
  const discard = row.getByRole("button", { name: "Discard Changes", exact: true });
  await discard.focus();
  await page.mouse.move(0, 0);
  await expect(discard).toBeVisible();
  const name = (await row.locator(".ai1-changes-name").boundingBox())!;
  const open = row.getByRole("button", { name: "Open File", exact: true });
  const button = (await open.boundingBox())!;
  expect(name.x + name.width).toBeLessThanOrEqual(button.x);
  await page.keyboard.press("Shift+Tab");
  await expect(open).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(discard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dialogBlock")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dialogBlock")).toHaveCount(0);
});

test("Problem tabs keep the file icon clear while retaining the problem count", async () => {
  const page = app.page;
  await page.locator("#files .theia-TreeNode", { hasText: "ShieldERC20sConfirm.tsx" }).dblclick();
  const tab = page.locator("#theia-main-content-panel .lm-TabBar-tab", {
    hasText: "ShieldERC20sConfirm.tsx",
  });
  await expect(tab).toBeVisible();
  await expect(tab.locator(".lm-TabBar-tail")).toHaveText("7");
  await expect(page.locator(".monaco-editor:visible .squiggly-error").first()).toBeVisible();
  await expect(tab.locator(".ai1-mi")).toHaveCount(1);
  await expect(tab.locator(".theia-decorator-size")).toHaveCount(0);
  for (const theme of ["dark", "light"]) {
    fs.writeFileSync(
      path.join(root, "config", "settings.json"),
      JSON.stringify({ "workbench.colorTheme": theme }),
    );
    await expect(page.locator("body")).toHaveClass(new RegExp(`theia-${theme}`));
    for (const count of [1, 7, 0]) {
      fs.writeFileSync(
        path.join(root, "workspace", "ShieldERC20sConfirm.tsx"),
        count
          ? Array.from(
              { length: count },
              (_, index) => `export const value${index}: number = 'invalid';`,
            ).join("\n")
          : "export const value: number = 1;\n",
      );
      const badge = tab.locator(".lm-TabBar-tail");
      if (count) {
        await expect(badge).toHaveText(String(count));
        await expect(page.locator(".monaco-editor:visible .squiggly-error").first()).toBeVisible();
        const label = (await tab.locator(".lm-TabBar-tabLabel").boundingBox())!;
        const badgeBounds = (await badge.boundingBox())!;
        const close = (await tab.locator(".lm-TabBar-tabCloseIcon").boundingBox())!;
        expect(label.x + label.width).toBeLessThanOrEqual(badgeBounds.x);
        expect(badgeBounds.x + badgeBounds.width).toBeLessThanOrEqual(close.x);
      } else {
        await expect(badge).toHaveCount(0);
        await expect(page.locator(".monaco-editor:visible .squiggly-error")).toHaveCount(0);
      }
      await expect(tab.locator(".ai1-mi")).toHaveCount(1);
      await expect(tab.locator(".theia-decorator-size")).toHaveCount(0);
      await tab.screenshot({ path: test.info().outputPath(`problem-tab-${theme}-${count}.png`) });
    }
  }
});

test("Changes Control-click zooms the diff or working file without hiding side panels", async () => {
  const page = app.page;
  const row = page.locator("#ai1-changes .theia-TreeNode", { hasText: "routes.ts" });
  await row.hover();
  await row.getByRole("button", { name: "Open File", exact: true }).click();
  await app.quickCommandPalette.type("Split Editor Right");
  await page.locator(".quick-input-widget .monaco-list-row", { hasText: "Split Editor Right" }).click();
  await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(2);
  const layout = () =>
    page.locator("#theia-main-content-panel .lm-TabBar").evaluateAll((bars) =>
      bars
        .map((bar) => {
          const rect = bar.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            tabs: Array.from(bar.querySelectorAll(".lm-TabBar-tab")).map((tab) => tab.id),
          };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x),
    );
  const sideBounds = await page.locator("#theia-right-side-panel").boundingBox();
  await row.locator(".ai1-changes-caption").click({ modifiers: ["Control"] });
  await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
  await expect(page.locator("#theia-main-content-panel .lm-TabBar-tab.lm-mod-current")).toContainText(
    "routes.ts (HEAD ↔ Working)",
  );
  await expect(page.locator("#theia-main-content-panel .monaco-diff-editor:visible")).toHaveCount(1);
  expect(await page.locator("#theia-right-side-panel").boundingBox()).toEqual(sideBounds);
  await row.locator(".ai1-changes-caption").click({ modifiers: ["Control"] });
  await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(2);
  const beforeFile = await layout();
  await row.hover();
  await row.getByRole("button", { name: "Open File", exact: true }).click({ modifiers: ["Control"] });
  await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
  await expect(page.locator("#theia-main-content-panel .lm-TabBar-tab.lm-mod-current")).toHaveText(
    /routes\.ts/,
  );
  await expect(page.locator("#theia-main-content-panel .lm-TabBar-tab.lm-mod-current")).not.toContainText(
    "HEAD ↔ Working",
  );
  await expect(page.locator("#theia-main-content-panel .monaco-diff-editor:visible")).toHaveCount(0);
  expect(await page.locator("#theia-right-side-panel").boundingBox()).toEqual(sideBounds);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect.poll(layout).toEqual(beforeFile);
  await row.locator(".ai1-changes-caption").click();
  await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(2);
  await expect(page.locator("#theia-main-content-panel .monaco-diff-editor:visible")).toHaveCount(1);
});
