import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaTextEditor, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

const repository = path.resolve(__dirname, "../..");
const application = process.env.AI1_PACKAGED_RESOURCES ?? path.join(repository, "applications/electron");

class EditorReleaseWorkspace extends TheiaWorkspace {
  constructor() {
    super();
    this.workspacePath = fs.realpathSync(this.workspacePath);
  }
}

function write(root: string, relative: string, content: string | object): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

test("nested editor projects resolve imports and hover types and apply their own save fixes", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-editor-release-")));
  const fixtureWorkspace = new EditorReleaseWorkspace();
  const workspace = fixtureWorkspace.path;
  const folders = ["code/team/web", "code/team/mobile"];
  const server = new FakeOpenCodeServer();
  let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    // Keep settings and service state separate from the owner's app.
    for (const folder of ["home", "config", "state/opencode", "cache", "xdg-config"]) {
      fs.mkdirSync(path.join(root, folder), { recursive: true });
    }
    write(root, "config/settings.json", { "ai1.welcome.startup": "never", "files.autoSave": "off" });
    write(workspace, ".theia/settings.json", {
      "eslint.workingDirectories": [{ mode: "auto" }],
      "eslint.useFlatConfig": true,
      "typescript.disableAutomaticTypeAcquisition": true,
    });
    write(workspace, "tsconfig.base.json", {
      compilerOptions: { strict: true, target: "ES2020", lib: ["ES2020", "DOM"], noEmit: true },
    });
    for (const [index, folder] of folders.entries()) {
      write(workspace, `${folder}/package.json`, {
        name: index === 0 ? "web-fixture" : "mobile-fixture",
        private: true,
      });
      write(workspace, `${folder}/tsconfig.json`, {
        extends: "../../../tsconfig.base.json",
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "react-jsx",
          types: ["react"],
          baseUrl: ".",
          paths: { "@domain/*": ["src/domain/*"] },
        },
        include: ["src"],
      });
      fs.symlinkSync(
        path.join(repository, "node_modules"),
        path.join(workspace, folder, "node_modules"),
        "dir",
      );
      write(
        workspace,
        `${folder}/src/domain/record.ts`,
        `export const record = { id: '${index === 0 ? "web" : "mobile"}', active: true };\n`,
      );
      write(
        workspace,
        `${folder}/src/request.ts`,
        [
          "import { record } from '@domain/record';",
          "export async function request(): Promise<string> {",
          "  if (!record.active) throw new Error('inactive');",
          "  return record.id;",
          "}",
          "request();",
        ].join("\n"),
      );
      write(
        workspace,
        `${folder}/src/App.tsx`,
        [
          "import { useState } from 'react';",
          "export function App() {",
          "  const [count, setCount] = useState(0);",
          "  return <button onClick={() => setCount(value => value + 1)}>{count}</button>;",
          "}",
        ].join("\n"),
      );
      write(workspace, `${folder}/src/errors.ts`, "export const realError: number = 'not a number';\n");
      const quote = index === 0 ? "single" : "double";
      write(
        workspace,
        `${folder}/eslint.config.cjs`,
        `module.exports = [{ files: ['**/*.js'], rules: { quotes: ['error', '${quote}'], semi: ['error', 'always'], eqeqeq: ['error', 'always'] } }];\n`,
      );
      write(
        workspace,
        `${folder}/src/save.js`,
        "export const label = `fixture`;\nexport const realError = label == 'other';\n",
      );
    }
    server.sessions = [];
    await server.start();
    write(root, "state/opencode/service.json", { url: server.baseUrl, password: server.password });
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
        HOME: path.join(root, "home"),
        THEIA_CONFIG_DIR: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
        XDG_CONFIG_HOME: path.join(root, "xdg-config"),
        XDG_CACHE_HOME: path.join(root, "cache"),
        TMUX_TMPDIR: root,
        TMUX: "",
      },
    });
    const app = new TheiaApp(await running.firstWindow(), fixtureWorkspace, true);
    await app.waitForShellAndInitialized();
    const editor = () => app.page.locator("#theia-main-content-panel .monaco-editor:visible");
    const hoverState = (operation?: "startEscape" | "stopEscape") =>
      app.page.evaluate((operation) => {
        type Model = { getLanguageId(): string; uri: { toString(): string } };
        type Features = { hoverProvider: { has(model: Model): boolean; ordered(model: Model): unknown[] } };
        type Services = { _parent?: Services; _services: { _entries: Map<unknown, unknown> } };
        type KeyEvent = { keyCode: number; browserEvent: KeyboardEvent };
        type Controller = {
          _ignoreMouseEvents: boolean;
          _isMouseDown: boolean;
          isHoverVisible: boolean;
          _contentWidget?: { isFocused: boolean; isVisible: boolean };
          _keybindingService: { softDispatch(event: KeyEvent, target: HTMLElement): unknown };
        };
        type Control = {
          getModel(): Model;
          getPosition(): { lineNumber: number; column: number };
          hasTextFocus(): boolean;
          getAction(id: string): { isSupported(): boolean } | null;
          getContribution(id: string): unknown;
          getDomNode(): HTMLElement;
          onKeyDown(callback: (event: KeyEvent) => void): { dispose(): void };
          _contributions?: { _instances: Map<string, Controller> };
          _instantiationService?: Services;
        };
        type Manager = { id: string; currentEditor?: { editor: { getControl(): Control } } };
        type Container = {
          parent?: Container;
          _bindingDictionary: { _map: Map<unknown, { cache?: unknown }[]> };
          get(key: unknown): Manager;
        };
        const browser = window as unknown as {
          theia: { container: Container };
          ai1EditorReleaseEscape?: { events: unknown[]; dispose(): void };
        };
        const container = browser.theia.container;
        let manager: Manager | undefined;
        for (let scope: Container | undefined = container; scope && !manager; scope = scope.parent) {
          manager = [...scope._bindingDictionary._map.values()]
            .flatMap((bindings) => bindings.map((binding) => binding.cache))
            .find(
              (value) =>
                value &&
                typeof value === "object" &&
                (value as Manager).id === "code-editor-opener" &&
                "currentEditor" in value,
            ) as Manager | undefined;
          if (!manager) {
            const key = [...scope._bindingDictionary._map.keys()].find((value) => {
              const prototype =
                typeof value === "function"
                  ? (value.prototype as { getByUri?: unknown; registerSelectionResolver?: unknown })
                  : undefined;
              return (
                typeof prototype?.getByUri === "function" &&
                typeof prototype.registerSelectionResolver === "function"
              );
            });
            if (key) manager = scope.get(key);
          }
        }
        const control = manager?.currentEditor?.editor.getControl();
        const model = control?.getModel();
        let features: Features | undefined;
        let codeEditors:
          | {
              getFocusedCodeEditor(): { getModel(): Model | null } | null;
              getActiveCodeEditor(): { getModel(): Model | null } | null;
            }
          | undefined;
        let context: { getContext(target: HTMLElement): { getValue(key: string): unknown } } | undefined;
        for (let scope = control?._instantiationService; scope; scope = scope._parent) {
          features ??= [...scope._services._entries].find(
            ([id]) => String(id) === "ILanguageFeaturesService",
          )?.[1] as Features | undefined;
          context ??= [...scope._services._entries].find(
            ([id]) => String(id) === "contextKeyService",
          )?.[1] as typeof context;
          codeEditors ??= [...scope._services._entries].find(
            ([id]) => String(id) === "codeEditorService",
          )?.[1] as typeof codeEditors;
        }
        const controller = control?._contributions?._instances.get("editor.contrib.contentHover");
        const targetInfo = (element: EventTarget | null) =>
          element instanceof Element
            ? {
                tag: element.tagName,
                className: element.className,
                role: element.getAttribute("role"),
                label: element.getAttribute("aria-label"),
              }
            : null;
        const keyState = () => {
          const active = document.activeElement;
          const values = active instanceof HTMLElement ? context?.getContext(active) : undefined;
          return {
            activeElement: targetInfo(active),
            activeInEditor: Boolean(active && control?.getDomNode().contains(active)),
            activeInHover: Boolean(active instanceof Element && active.closest(".monaco-hover")),
            contextsAvailable: Boolean(values),
            inQuickOpen: values?.getValue("inQuickOpen"),
            notificationsVisible: values?.getValue("notificationsVisible"),
            editorHasSelection: values?.getValue("editorHasSelection"),
            editorHasMultipleSelections: values?.getValue("editorHasMultipleSelections"),
            suggestWidgetVisible: values?.getValue("suggestWidgetVisible"),
            menuVisible: Array.from(document.querySelectorAll<HTMLElement>(".monaco-menu-container")).some(
              (node) => node.offsetWidth > 0 && node.offsetHeight > 0,
            ),
            monacoFocusedUri: codeEditors?.getFocusedCodeEditor()?.getModel()?.uri.toString(),
            monacoActiveUri: codeEditors?.getActiveCodeEditor()?.getModel()?.uri.toString(),
            controller: controller
              ? {
                  ignoreMouseEvents: controller._ignoreMouseEvents,
                  mouseDown: controller._isMouseDown,
                  visible: controller.isHoverVisible,
                  widgetFocused: controller._contentWidget?.isFocused,
                }
              : null,
          };
        };
        if (operation === "startEscape") {
          if (!control || !controller)
            throw new Error("The Escape probe needs the current hover controller.");
          if (browser.ai1EditorReleaseEscape) throw new Error("The Escape probe already exists.");
          const events: unknown[] = [];
          const record = (phase: string, event: KeyboardEvent, monaco?: KeyEvent) => {
            if (event.key !== "Escape") return;
            events.push({
              phase,
              key: event.key,
              code: event.code,
              defaultPrevented: event.defaultPrevented,
              target: targetInfo(event.target),
              monacoKeyCode: monaco?.keyCode,
              dispatch: monaco
                ? controller._keybindingService.softDispatch(monaco, control.getDomNode())
                : undefined,
              ...keyState(),
            });
          };
          const windowCapture = (event: KeyboardEvent) => record("window-capture", event);
          const documentCapture = (event: KeyboardEvent) => record("document-capture", event);
          const documentBubble = (event: KeyboardEvent) => record("document-bubble", event);
          window.addEventListener("keydown", windowCapture, true);
          document.addEventListener("keydown", documentCapture, true);
          document.addEventListener("keydown", documentBubble);
          const subscription = control.onKeyDown((event) => record("monaco", event.browserEvent, event));
          browser.ai1EditorReleaseEscape = {
            events,
            dispose: () => {
              window.removeEventListener("keydown", windowCapture, true);
              document.removeEventListener("keydown", documentCapture, true);
              document.removeEventListener("keydown", documentBubble);
              subscription.dispose();
            },
          };
        }
        const escapeEvents = browser.ai1EditorReleaseEscape?.events;
        if (operation === "stopEscape") {
          browser.ai1EditorReleaseEscape?.dispose();
          delete browser.ai1EditorReleaseEscape;
        }
        return {
          managerFound: Boolean(manager),
          documentFocused: document.hasFocus(),
          editorFocused: control?.hasTextFocus(),
          position: control?.getPosition(),
          uri: model?.uri.toString(),
          language: model?.getLanguageId(),
          providerReady: model && features ? features.hoverProvider.has(model) : false,
          providerCount: model && features ? features.hoverProvider.ordered(model).length : 0,
          actionSupported: control?.getAction("editor.action.showHover")?.isSupported() ?? false,
          controllerPresent: Boolean(control?.getContribution("editor.contrib.contentHover")),
          ...keyState(),
          escapeEvents,
        };
      }, operation);
    const commandEvents = (operation: "start" | "read" | "hide" | "stop") =>
      app.page.evaluate(async (operation) => {
        type Event = { phase: "will" | "did"; commandId: string };
        type Disposable = { dispose(): void };
        type Registry = {
          executeCommand(id: string): Promise<unknown>;
          onWillExecuteCommand(callback: (event: { commandId: string }) => void): Disposable;
          onDidExecuteCommand(callback: (event: { commandId: string }) => void): Disposable;
        };
        type Container = {
          parent?: Container;
          _bindingDictionary: { _map: Map<unknown, unknown> };
          get(key: unknown): Registry;
        };
        const browser = window as unknown as {
          theia: { container: Container };
          ai1EditorReleaseCommands?: { events: Event[]; subscriptions: Disposable[]; registry: Registry };
        };
        if (operation === "start") {
          if (browser.ai1EditorReleaseCommands) throw new Error("Command capture already exists.");
          let registry: Registry | undefined;
          for (
            let scope: Container | undefined = browser.theia.container;
            scope && !registry;
            scope = scope.parent
          ) {
            const key = [...scope._bindingDictionary._map.keys()].find((value) => {
              const prototype =
                typeof value === "function"
                  ? (value.prototype as {
                      getCommand?: unknown;
                      getActiveHandler?: unknown;
                      executeCommand?: unknown;
                    })
                  : undefined;
              return (
                typeof prototype?.getCommand === "function" &&
                typeof prototype.getActiveHandler === "function" &&
                typeof prototype.executeCommand === "function"
              );
            });
            if (key) registry = scope.get(key);
          }
          if (!registry) throw new Error("The real command registry is not available.");
          const events: Event[] = [];
          browser.ai1EditorReleaseCommands = {
            events,
            registry,
            subscriptions: [
              registry.onWillExecuteCommand((event) =>
                events.push({ phase: "will", commandId: event.commandId }),
              ),
              registry.onDidExecuteCommand((event) =>
                events.push({ phase: "did", commandId: event.commandId }),
              ),
            ],
          };
          return [];
        }
        const capture = browser.ai1EditorReleaseCommands;
        if (!capture) throw new Error("Command capture does not exist.");
        if (operation === "hide") await capture.registry.executeCommand("editor.action.hideHover");
        if (operation === "stop") {
          for (const subscription of capture.subscriptions) subscription.dispose();
          delete browser.ai1EditorReleaseCommands;
        }
        return capture.events;
      }, operation);
    const openEditor = async (relative: string) => {
      await app.page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
      const input = app.page.locator(".quick-input-widget input");
      await expect(input).toBeVisible();
      await input.fill(relative);
      const row = app.page
        .locator(".quick-input-widget .monaco-list-row")
        .filter({ hasText: path.basename(relative) });
      await expect(row).toHaveCount(1);
      await row.click();
      const opened = new TheiaTextEditor(relative, app);
      await opened.waitForVisible();
      return opened;
    };

    for (const [index, folder] of folders.entries()) {
      // A real diagnostic proves that TypeScript runs before the clean-file checks.
      const errors = await openEditor(`${folder}/src/errors.ts`);
      const squiggle = editor().locator(".squiggly-error");
      await expect(squiggle).toHaveCount(1);
      await editor()
        .locator(".view-line span")
        .filter({ hasText: /^realError$/ })
        .last()
        .hover();
      await expect(app.page.locator(".monaco-hover:visible")).toContainText(
        "not assignable to type 'number'",
      );
      await app.page.keyboard.press("Escape");
      await errors.replaceLineWithLineNumber("export const realError: number = 42;", 1);
      await app.page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
      await expect(squiggle).toHaveCount(0);

      await openEditor(`${folder}/src/request.ts`);
      const requestToken = editor()
        .locator(".view-line")
        .filter({ hasText: /^request\(\);$/ })
        .locator("span")
        .filter({ hasText: /^request$/ })
        .last();
      await requestToken.click();
      await app.page.mouse.move(0, 0);
      await app.page.keyboard.press("Escape");
      await expect(app.page.locator(".monaco-hover:visible")).toHaveCount(0);
      const beforeHover = await hoverState();
      expect(beforeHover.providerReady).toBe(true);
      expect(beforeHover.actionSupported).toBe(true);
      expect(beforeHover.controllerPresent).toBe(true);

      // Activate the semantic command and record its real dispatched ID.
      await commandEvents("start");
      try {
        await app.page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+p" : "Control+Shift+p");
        const input = app.page.locator(".quick-input-widget .monaco-inputbox .input");
        await expect(input).toBeVisible();
        await input.fill(">Show or Focus Hover");
        const label = app.page
          .locator(".quick-input-widget .monaco-list-row .monaco-highlighted-label")
          .filter({ hasText: /^Show or Focus Hover$/ });
        await expect(label).toHaveCount(1);
        await label.click();
        await expect(app.page.locator(".quick-input-widget")).toBeHidden();
        await expect(app.page.locator(".monaco-hover:visible")).toContainText("Promise<string>");
        const events = await commandEvents("read");
        expect(events.filter((event) => event.commandId === "editor.action.showHover")).toEqual([
          { phase: "will", commandId: "editor.action.showHover" },
          { phase: "did", commandId: "editor.action.showHover" },
        ]);
        expect(events.some((event) => event.commandId === "editor.debug.action.showDebugHover")).toBe(false);
        await app.page.mouse.move(0, 0);
        const escapeProbe = process.env.AI1_E2E_ESCAPE_PROBE;
        if (escapeProbe === "1" || escapeProbe === "observe") {
          await test.step("Escape closes the command hover with editor text focus", async () => {
            const beforeEscape = await hoverState("startEscape");
            try {
              if (escapeProbe === "1") {
                expect(beforeEscape.documentFocused).toBe(true);
                expect(beforeEscape.editorFocused).toBe(true);
                expect(beforeEscape.activeInEditor).toBe(true);
                expect(beforeEscape.activeInHover).toBe(false);
                expect(beforeEscape.contextsAvailable).toBe(true);
                expect(beforeEscape.inQuickOpen).toBe(false);
                expect(beforeEscape.notificationsVisible).toBe(false);
                expect(beforeEscape.editorHasSelection).toBe(false);
                expect(beforeEscape.editorHasMultipleSelections).toBe(false);
                expect(beforeEscape.suggestWidgetVisible).toBe(false);
                expect(beforeEscape.menuVisible).toBe(false);
                expect(beforeEscape.controller?.ignoreMouseEvents).toBe(false);
                expect(beforeEscape.monacoFocusedUri).toBe(beforeEscape.uri);
                expect(beforeEscape.monacoActiveUri).toBe(beforeEscape.uri);
              }
              await expect(app.page.locator(".monaco-hover:visible")).toContainText("Promise<string>");
              await app.page.keyboard.press("Escape");
              await expect(app.page.locator(".monaco-hover:visible")).toHaveCount(0);
            } finally {
              await test.info().attach(`escape-hover-${index}`, {
                body: JSON.stringify(
                  {
                    before: beforeEscape,
                    after: await hoverState("stopEscape"),
                    commands: await commandEvents("read"),
                  },
                  null,
                  2,
                ),
                contentType: "application/json",
              });
            }
          });
        }
        await commandEvents("hide");
        await expect(app.page.locator(".monaco-hover:visible")).toHaveCount(0);
      } finally {
        const events = await commandEvents("stop");
        await test.info().attach(`command-hover-${index}`, {
          body: JSON.stringify({ before: beforeHover, after: await hoverState(), events }, null, 2),
          contentType: "application/json",
        });
      }
      // Check pointer hover separately so the command result cannot satisfy it.
      try {
        await requestToken.hover();
        await expect(app.page.locator(".monaco-hover:visible")).toContainText("Promise<string>");
      } finally {
        await test.info().attach(`semantic-hover-${index}`, {
          body: JSON.stringify({ before: beforeHover, after: await hoverState() }, null, 2),
          contentType: "application/json",
        });
      }
      await app.page.keyboard.press("Escape");
      await expect(editor().locator(".squiggly-error")).toHaveCount(0);

      // Follow the alias to this project's source, not its sibling's source.
      const token = editor()
        .locator(".view-line")
        .filter({ hasText: "return record.id;" })
        .locator("span")
        .filter({ hasText: /^record$/ })
        .last();
      await token.click();
      await app.page.keyboard.press("F12");
      await expect(editor()).toContainText(`id: '${index === 0 ? "web" : "mobile"}'`);
      const component = await openEditor(`${folder}/src/App.tsx`);
      await expect(editor()).toContainText("useState");
      await expect(editor().locator(".squiggly-error")).toHaveCount(0);
      await component.replaceLineWithLineNumber(
        '  return <button onClick={() => setCount("wrong")}>{count}</button>;',
        4,
      );
      await expect(editor().locator(".squiggly-error")).toHaveCount(1);
      await editor().locator(".view-line span").filter({ hasText: '"wrong"' }).last().hover();
      await expect(app.page.locator(".monaco-hover:visible")).toContainText("SetStateAction<number>");
      await app.page.keyboard.press("Escape");
      await component.replaceLineWithLineNumber(
        "  return <button onClick={() => setCount(value => value + 1)}>{count}</button>;",
        4,
      );
      await app.page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
      await expect(editor().locator(".squiggly-error")).toHaveCount(0);

      // Save through the editor. Do not invoke ESLint from the test.
      const saved = await openEditor(`${folder}/src/save.js`);
      await expect(editor().locator(".squiggly-error").first()).toBeVisible();
      await saved.replaceLineWithLineNumber("export const label = `saved`", 1);
      await app.page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
      const file = path.join(workspace, folder, "src/save.js");
      const expected = index === 0 ? "export const label = 'saved';" : 'export const label = "saved";';
      await expect.poll(() => fs.readFileSync(file, "utf8")).toContain(expected);
      await expect(editor().locator(".squiggly-error")).toHaveCount(1);
      await editor().locator(".view-line span").filter({ hasText: /==/ }).last().hover();
      await expect(app.page.locator(".monaco-hover:visible")).toContainText("eqeqeq");
      await app.page.keyboard.press("Escape");
    }
  } finally {
    try {
      await running?.close();
    } finally {
      try {
        await server.stop();
      } finally {
        await removeTempDir(workspace);
        await removeTempDir(root);
      }
    }
  }
});
