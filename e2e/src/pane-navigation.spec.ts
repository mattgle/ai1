import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

for (const firstSplit of ["right", "down"] as const) {
  test(`Panel and tab numbers stay separate after a first ${firstSplit} split`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-pane-navigation-")));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    fs.mkdirSync(path.join(root, "config"));
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "never" }),
    );
    fs.writeFileSync(path.join(workspace, "zoom-test.txt"), "Center zoom test\n");
    fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
    const server = new FakeOpenCodeServer();
    server.sessions = [];
    await server.start();
    fs.writeFileSync(
      path.join(root, "state/opencode/service.json"),
      JSON.stringify({ url: server.baseUrl, password: server.password }),
    );
    const tmux = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim();
    const socket = path.join(root, `tmux-${process.getuid!()}`, "default");
    let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
    try {
      const application =
        process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
      const launchOptions = {
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
      };
      running = await electron.launch(launchOptions);
      const page = await running.firstWindow();
      await new TheiaApp(page, new TheiaWorkspace(), true).waitForShellAndInitialized();
      await expect
        .poll(() =>
          running!.evaluate(({ Menu }) => {
            const pending = [...(Menu.getApplicationMenu()?.items ?? [])];
            while (pending.length) {
              const item = pending.shift()!;
              if (item.label.replace(/&/g, "") === "Close Window") {
                return { found: true, accelerator: item.accelerator ?? "" };
              }
              if (item.submenu) pending.push(...item.submenu.items);
            }
            return { found: false, accelerator: "" };
          }),
        )
        .toEqual({ found: true, accelerator: "" });
      await page.keyboard.press("Meta+Shift+w");
      await expect(page.locator("#theia-main-content-panel")).toBeVisible();
      const focusedId = () =>
        page
          .locator("#theia-main-content-panel .terminal-container", {
            has: page.locator(".xterm-helper-textarea:focus"),
          })
          .getAttribute("id");
      const newTerminal = async () => {
        const before = await page.evaluate(() => document.activeElement?.closest(".terminal-container")?.id);
        await page.keyboard.press("Meta+t");
        await expect(
          page.getByRole("textbox", { name: "New persistent terminal in", exact: true }),
        ).toBeFocused();
        await expect(page.locator(".quick-input-widget .monaco-list-row.focused")).toContainText("workspace");
        await page.keyboard.press("Enter");
        await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
        await expect.poll(focusedId).not.toBe(before);
        return (await focusedId())!;
      };
      const topLeft = await newTerminal();
      await page.keyboard.press(firstSplit === "right" ? "Meta+d" : "Meta+Shift+d");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(2);
      const second = (await focusedId())!;
      await page.keyboard.press(firstSplit === "right" ? "Meta+Shift+d" : "Meta+d");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(3);
      const bottomRight = (await focusedId())!;
      await page.locator(`#${topLeft} .xterm-helper-textarea`).click();
      await page.keyboard.press(firstSplit === "right" ? "Meta+Shift+d" : "Meta+d");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(4);
      const fourth = (await focusedId())!;
      const panels = [
        topLeft,
        firstSplit === "right" ? second : fourth,
        firstSplit === "right" ? fourth : second,
        bottomRight,
      ];
      for (const [index, id] of panels.entries()) {
        await page.keyboard.press(`Meta+Control+${index + 1}`);
        await expect.poll(focusedId).toBe(id);
        for (let number = 2; number <= 9; number++) {
          await page.keyboard.press(`Meta+${number}`);
          await expect.poll(focusedId).toBe(id);
        }
      }
      await page.keyboard.press("Meta+Control+1");
      const extraTab = await newTerminal();
      await page.keyboard.press("Meta+1");
      await expect.poll(focusedId).toBe(topLeft);
      await page.keyboard.press("Meta+2");
      await expect.poll(focusedId).toBe(extraTab);
      await page.keyboard.press("Meta+Control+4");
      await expect.poll(focusedId).toBe(bottomRight);
      await page.keyboard.press("Meta+Control+1");
      await expect.poll(focusedId).toBe(extraTab);
      for (let number = 5; number <= 9; number++) {
        await page.keyboard.press(`Meta+Control+${number}`);
        await expect.poll(focusedId).toBe(extraTab);
      }
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
      const sides = () =>
        page.locator("#theia-left-side-panel, #theia-right-side-panel").evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height];
          }),
        );
      const beforeZoom = await layout();
      const beforeSides = await sides();
      await page.keyboard.press("Meta+Control+Enter");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
      await expect(page.locator(`#shell-tab-${extraTab}`)).toBeVisible();
      await expect(page.locator("#theia-main-content-panel .xterm:visible")).toHaveCount(1);
      const centerBounds = (await page.locator("#theia-main-content-panel").boundingBox())!;
      const zoomBounds = (await page.locator(`#${extraTab}`).boundingBox())!;
      expect(Math.abs(zoomBounds.width - centerBounds.width)).toBeLessThan(4);
      const headerBounds = (await page
        .locator("#theia-main-content-panel .lm-TabBar:visible")
        .boundingBox())!;
      expect(Math.abs(zoomBounds.height + headerBounds.height - centerBounds.height)).toBeLessThan(4);
      expect(await sides()).toEqual(beforeSides);
      await expect.poll(focusedId).toBe(extraTab);
      await page.keyboard.press("Escape");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect.poll(layout).toEqual(beforeZoom);
      await page.locator("#files .theia-TreeNode", { hasText: "zoom-test.txt" }).dblclick();
      await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
      const withFile = await layout();
      await page.keyboard.press("Meta+Control+Enter");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
      await expect(
        page.locator("#theia-main-content-panel .lm-TabBar-tab.lm-mod-current", { hasText: "zoom-test.txt" }),
      ).toBeVisible();
      await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(1);
      expect(await sides()).toEqual(beforeSides);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect.poll(layout).toEqual(withFile);
      await page.keyboard.press("Meta+w");
      await expect(page.locator("#theia-main-content-panel .monaco-editor:visible")).toHaveCount(0);
      const lastCenter = await focusedId();
      for (const [keys, id] of [
        ["Meta+Control+a", "ai1-agents"],
        ["Meta+Control+c", "ai1-changes"],
      ]) {
        await page.keyboard.press(keys);
        await expect(page.locator(`#${id}`)).toBeVisible();
        await expect
          .poll(() => page.locator(`#${id}`).evaluate((node) => node.contains(document.activeElement)))
          .toBe(true);
        await page.keyboard.press(keys);
        await expect(page.locator(`#${id}`)).toBeVisible();
        await page.keyboard.press("Meta+Control+0");
        await expect.poll(focusedId).toBe(lastCenter);
      }
      if (process.env.AI1_E2E_OPENCODE === "1" && firstSplit === "right") {
        const opencode = execFileSync("which", ["opencode"], { encoding: "utf8" }).trim();
        const environment = ["CONFIG", "DATA", "STATE", "CACHE"]
          .map(
            (name) => `XDG_${name}_HOME=${JSON.stringify(path.join(root, `opencode-${name.toLowerCase()}`))}`,
          )
          .join(" ");
        const session = topLeft.replace("ai1-tmux-", "");
        execFileSync(tmux, [
          "-S",
          socket,
          "send-keys",
          "-t",
          session,
          "-l",
          `env ${environment} ${JSON.stringify(opencode)} --standalone`,
        ]);
        execFileSync(tmux, ["-S", socket, "send-keys", "-t", session, "Enter"]);
        await expect
          .poll(
            () =>
              execFileSync(tmux, ["-S", socket, "display-message", "-p", "-t", session, "#{alternate_on}"], {
                encoding: "utf8",
              }).trim(),
            { timeout: 30000 },
          )
          .toBe("1");
        await page.keyboard.press("Meta+Control+1");
        await page.keyboard.press("Meta+1");
        await expect.poll(focusedId).toBe(topLeft);
        await page.keyboard.press("Meta+Control+Enter");
        await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
        await expect(page.locator(`#shell-tab-${topLeft}`)).toBeVisible();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(4);
        await expect.poll(focusedId).toBe(topLeft);
        await page.keyboard.press("Meta+2");
        await expect.poll(focusedId).toBe(extraTab);
        await page.keyboard.press("Meta+1");
        await expect.poll(focusedId).toBe(topLeft);
        for (let number = 3; number <= 9; number++) {
          await page.keyboard.press(`Meta+${number}`);
          await expect.poll(focusedId).toBe(topLeft);
        }
        for (const [index, id] of panels.entries()) {
          await page.keyboard.press(`Meta+Control+${index + 1}`);
          await expect.poll(focusedId).toBe(id);
        }
        await page.keyboard.press("Meta+Control+1");
        await expect.poll(focusedId).toBe(topLeft);
        await page.keyboard.press("Meta+2");
        await expect.poll(focusedId).toBe(extraTab);
      }
      await page.keyboard.press("Meta+Control+1");
      await page.keyboard.press("Meta+2");
      await expect.poll(focusedId).toBe(extraTab);
      await page.keyboard.press("Meta+Control+Enter");
      await expect(page.locator("#theia-main-content-panel .lm-TabBar:visible")).toHaveCount(1);
      await expect(page.locator("#theia-main-content-panel .xterm:visible")).toHaveCount(1);
      await Promise.all([running.waitForEvent("close"), running.evaluate(({ app }) => app.quit())]);
      running = await electron.launch(launchOptions);
      const restored = await running.firstWindow();
      await new TheiaApp(restored, new TheiaWorkspace(), true).waitForShellAndInitialized();
      await expect(restored.locator("#theia-main-content-panel .lm-TabBar")).toHaveCount(4);
      for (const [index, id] of [extraTab, ...panels.slice(1)].entries()) {
        await restored.keyboard.press(`Meta+Control+${index + 1}`);
        await expect(restored.locator(`#${id} .xterm-helper-textarea`)).toBeFocused();
      }
      await restored.keyboard.press("Meta+Control+1");
      await restored.keyboard.press("Meta+1");
      await expect(restored.locator(`#${topLeft} .xterm-helper-textarea`)).toBeFocused();
      await restored.keyboard.press("Meta+2");
      await expect(restored.locator(`#${extraTab} .xterm-helper-textarea`)).toBeFocused();
    } finally {
      await running?.close();
      await server.stop();
      spawnSync(tmux, ["-S", socket, "kill-server"]);
      await removeTempDir(root);
    }
  });
}
