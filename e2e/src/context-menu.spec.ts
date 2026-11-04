import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

type MenuState = {
  menu?: Electron.Menu;
  shown: boolean;
  closed: boolean;
  labels: string[];
};

for (const target of ["Explorer", "file tab", "editor", "side-panel tab"] as const) {
  test(`Right-click opens the native ${target} menu`, async () => {
    const testInfo = test.info();
    test.skip(process.env.AI1_E2E_BACKGROUND === "1", "Native menus require an approved visible-window run.");
    const temporary = path.join(os.tmpdir(), "opencode");
    fs.mkdirSync(temporary, { recursive: true });
    const root = fs.realpathSync(fs.mkdtempSync(path.join(temporary, "ai1-context-menu-")));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    fs.mkdirSync(path.join(root, "config"));
    fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "sample.md"), "# Context menu preview\n");
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "never", "window.titleBarStyle": "native" }),
    );
    const server = new FakeOpenCodeServer();
    server.sessions = [];
    let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
    const errors: string[] = [];
    try {
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
      const page = await running.firstWindow();
      page.on("pageerror", (error) => errors.push(error.message));
      await new TheiaApp(page, new TheiaWorkspace(), true).waitForShellAndInitialized();
      await running.evaluate(({ Menu }) => {
        const state: MenuState = { shown: false, closed: false, labels: [] };
        (globalThis as typeof globalThis & { contextMenuProbe: MenuState }).contextMenuProbe = state;
        const popup = Menu.prototype.popup;
        Menu.prototype.popup = function (options) {
          state.menu = this;
          state.labels = this.items.map((item) => item.label);
          this.once("menu-will-show", () => (state.shown = true));
          this.once("menu-will-close", () => (state.closed = true));
          // Observe the real popup. A stub cannot detect a missing native menu.
          return popup.call(this, options);
        };
      });
      const file = page.locator("#files .theia-TreeNode", { hasText: "sample.md" });
      await file.dblclick();
      await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
      const targets = {
        Explorer: file,
        "file tab": page.locator("#theia-main-content-panel .lm-TabBar-tab", { hasText: "sample.md" }),
        editor: page.locator("#theia-main-content-panel .monaco-editor:visible .view-lines"),
        "side-panel tab": page.locator("#shell-tab-ai1-agents"),
      };
      await targets[target].click({ button: "right" });
      await expect
        .poll(() =>
          running!.evaluate(() => {
            const state = (globalThis as typeof globalThis & { contextMenuProbe: MenuState })
              .contextMenuProbe;
            return state.shown && !state.closed;
          }),
        )
        .toBe(true);
      if (target === "Explorer" || target === "file tab") {
        await running.evaluate(({ BrowserWindow }) => {
          const state = (globalThis as typeof globalThis & { contextMenuProbe: MenuState }).contextMenuProbe;
          const item = state.menu!.items.find((entry) => entry.label === "Open Preview");
          if (!item?.enabled) throw new Error("Open Preview is missing or disabled");
          item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
          state.menu!.closePopup();
        });
        await expect
          .poll(async () => {
            for (const frame of page.frames()) {
              if (await frame.getByRole("heading", { name: "Context menu preview", exact: true }).count()) {
                return true;
              }
            }
            return false;
          })
          .toBe(true);
      }
    } finally {
      const menu = await running
        ?.evaluate(() => {
          const state = (globalThis as typeof globalThis & { contextMenuProbe?: MenuState }).contextMenuProbe;
          state?.menu?.closePopup();
          return state && { shown: state.shown, closed: state.closed, labels: state.labels };
        })
        .catch(() => undefined);
      await testInfo.attach("native-menu", {
        body: JSON.stringify({ target, menu, errors }, null, 2),
        contentType: "application/json",
      });
      await running?.close();
      await server.stop();
      await removeTempDir(root);
    }
  });
}
