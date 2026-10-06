import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

let root: string;
let server: FakeOpenCodeServer;
let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-image-preview-")));
  const workspace = path.join(root, "workspace");
  const state = path.join(root, "state");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(state, "opencode"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "sample.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>',
  );
  fs.writeFileSync(
    path.join(workspace, "sample.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42gEFAPr/AP///wAI/AL+Sr4t6gAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  fs.writeFileSync(path.join(workspace, "sample.txt"), "This file stays in the text editor.\n");
  server = new FakeOpenCodeServer();
  await server.start();
  fs.writeFileSync(
    path.join(state, "opencode", "service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  const application =
    process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
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
});

test.afterAll(async () => {
  await electronApp?.close();
  await server?.stop();
  await removeTempDir(root);
});

test("PNG and SVG open as image tabs and text keeps its editor", async () => {
  const page = app.page;
  for (const [name, width, height] of [
    ["sample.png", 1, 1],
    ["sample.svg", 40, 30],
  ] as const) {
    await page.locator("#files .theia-TreeNode", { hasText: name }).dblclick();
    await expect(page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: name })).toHaveCount(1);
    await expect
      .poll(async () => {
        for (const frame of page.frames()) {
          const image = frame.locator("body.image img");
          if (await image.count()) {
            const size = await image.first().evaluate((node) => ({
              width: (node as HTMLImageElement).naturalWidth,
              height: (node as HTMLImageElement).naturalHeight,
            }));
            if (size.width === width && size.height === height) {
              return true;
            }
          }
        }
        return false;
      })
      .toBe(true);
    await page.locator("#files .theia-TreeNode", { hasText: name }).dblclick();
    await expect(page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: name })).toHaveCount(1);
  }
  await expect(
    page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sample.png" }),
  ).toHaveCount(1);
  await page.locator("#files .theia-TreeNode", { hasText: "sample.txt" }).dblclick();
  await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
});
