import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { CommandRegistry } = require("@theia/core/lib/common/command");
const root = path.resolve(import.meta.dirname, "../node_modules/@theia");
const decorators = { inject: () => () => {}, injectable: () => (value) => value, optional: () => () => {} };
const localized = {
  localize: (_id, text) => text,
  localize2: (_id, text) => ({ value: text, original: text }),
  localizeByDefault: (text) => text,
  getDefaultKey: (text) => text,
};

function load(relative, dependencies, globals = {}) {
  const filename = path.join(root, relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require: (id) => {
        assert.ok(Object.hasOwn(dependencies, id), `The test supplies the dependency ${id}.`);
        return dependencies[id];
      },
      ...globals,
    },
    { filename },
  );
  return module.exports;
}

function hoverAction() {
  const directory = "monaco-editor-core/esm/vs/editor/contrib/hover/browser/";
  const ids = load(`${directory}hoverActionIds.js`, { "../../../../nls.js": localized });
  class EditorAction {
    constructor(options) {
      this.id = options.id;
      this.label = options.label.value;
      this.alias = options.label.original;
    }
  }
  class Range {
    constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
      Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
    }
  }
  const { ShowOrFocusHoverAction } = load(`${directory}hoverActions.js`, {
    "./hoverActionIds.js": ids,
    "../../../../base/common/keyCodes.js": { KeyChord: (first, second) => [first, second] },
    "../../../browser/editorExtensions.js": { EditorAction },
    "../../../common/core/range.js": { Range },
    "../../../common/editorContextKeys.js": { EditorContextKeys: { editorTextFocus: "editorTextFocus" } },
    "../../gotoSymbol/browser/link/goToDefinitionAtPosition.js": {},
    "./contentHoverController.js": {
      ContentHoverController: { get: (editor) => editor.getContribution("editor.contrib.contentHover") },
    },
    "../../../common/languages.js": {},
    "../../../../nls.js": localized,
    "./hover.css": {},
  });
  return new ShowOrFocusHoverAction();
}

function debugCommand() {
  const command = { toDefaultLocalizedCommand: (value) => value, toLocalizedCommand: (value) => value };
  return load("debug/src/browser/debug-commands.ts", {
    "@theia/core/lib/common": { Command: command, MAIN_MENU_BAR: [] },
    "@theia/core/lib/browser": { codicon: (value) => value },
    "@theia/core/lib/common/nls": { nls: localized },
  }).DebugCommands.SHOW_HOVER;
}

function palette(registry, focus) {
  const { QuickCommandService } = load(
    "core/src/browser/quick-input/quick-command-service.ts",
    {
      inversify: decorators,
      "../keybinding": {},
      "../../common": { Command: { toDefaultLocalizedCommand: (value) => value }, nls: localized },
      "../context-key-service": {},
      "../../common/core-preferences": {},
      "./quick-access": {},
      "./quick-input-service": {},
      "../keys": {},
      "../widgets": { codiconArray: () => [] },
    },
    { window: { document: { activeElement: { focus } } } },
  );
  const service = Object.create(QuickCommandService.prototype);
  service.commandRegistry = registry;
  service.keybindingRegistry = { getKeybindingsForCommand: () => [] };
  return service;
}

function registerMonaco(registry, action, codeEditors) {
  const editorService = Symbol("editor-service");
  const instantiationService = Symbol("instantiation-service");
  const common = Object.fromEntries(
    ["SELECT_ALL", "FIND", "REPLACE", "CUT", "COPY", "PASTE"].map((name) => [name, { id: name }]),
  );
  const { MonacoEditorCommandHandlers } = load("monaco/src/browser/monaco-command.ts", {
    "@theia/core/shared/inversify": decorators,
    "@theia/core/shared/vscode-languageserver-protocol": {},
    "@theia/core/shared/vscode-uri": {},
    "@theia/core": {},
    "@theia/core/lib/common/command": {},
    "@theia/core/lib/browser": { CommonCommands: common },
    "@theia/editor/lib/browser": {},
    "./monaco-editor": {},
    "./monaco-command-registry": {},
    "./protocol-to-monaco-converter": {},
    "@theia/core/lib/common/nls": { nls: localized },
    "@theia/monaco-editor-core/esm/vs/editor/browser/editorExtensions": {
      EditorExtensionsRegistry: { getEditorActions: () => [action] },
    },
    "@theia/monaco-editor-core/esm/vs/platform/commands/common/commands": {
      CommandsRegistry: { getCommands: () => new Map([[action.id, {}]]) },
    },
    "@theia/monaco-editor-core": {},
    "@theia/monaco-editor-core/esm/vs/editor/common/model": {},
    "@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices": {
      StandaloneServices: { get: (id) => (id === editorService ? codeEditors : {}) },
    },
    "@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation": {
      IInstantiationService: instantiationService,
    },
    "@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService": {
      ICodeEditorService: editorService,
    },
  });
  const handlers = Object.create(MonacoEditorCommandHandlers.prototype);
  handlers.commandRegistry = registry;
  handlers.registerMonacoCommands();
}

test("the old Show Hover substring selects the debug command, not the semantic action", () => {
  const action = hoverAction();
  const debug = debugCommand();
  const registry = new CommandRegistry({ getContributions: () => [] });
  const service = palette(registry, () => {});
  const items = [action, debug].map((command) => ({ id: command.id, ...service.toItem(command) }));
  assert.equal(action.id, "editor.action.showHover");
  assert.equal(action.label, "Show or Focus Hover");
  assert.equal(debug.id, "editor.debug.action.showDebugHover");
  assert.deepEqual(
    items.filter((item) => item.label.includes("Show Hover")).map((item) => item.id),
    [debug.id],
  );
  assert.deepEqual(
    items.filter((item) => item.label === "Show or Focus Hover").map((item) => item.id),
    [action.id],
  );
});

for (const route of ["focused", "active"]) {
  test(`the real palette and Monaco handler dispatch the semantic action through the ${route} editor`, async () => {
    const action = hoverAction();
    const registry = new CommandRegistry({ getContributions: () => [] });
    const calls = [];
    let focused;
    const controller = { isHoverVisible: false, showContentHover: (...args) => calls.push(args) };
    const editor = {
      hasModel: () => true,
      getPosition: () => ({ lineNumber: 6, column: 4 }),
      getOption: () => 0,
      getContribution: (id) => (id === "editor.contrib.contentHover" ? controller : undefined),
      getAction: (id) =>
        id === action.id ? { isSupported: () => true, run: () => action.run(undefined, editor) } : undefined,
    };
    registerMonaco(registry, action, {
      getFocusedCodeEditor: () => focused,
      getActiveCodeEditor: () => editor,
    });
    let restores = 0;
    const service = palette(registry, () => {
      restores++;
      if (route === "focused") focused = editor;
    });
    const item = service.toItem(registry.getCommand(action.id));
    const completed = new Promise((resolve) => {
      const subscription = registry.onDidExecuteCommand((event) => {
        if (event.commandId === action.id) {
          subscription.dispose();
          resolve(event);
        }
      });
    });

    // Execute the real palette item, not a direct controller call.
    item.execute();
    const event = await completed;
    assert.equal(event.commandId, "editor.action.showHover");
    assert.equal(restores, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(
      { ...calls[0][0] },
      { startLineNumber: 6, startColumn: 4, endLineNumber: 6, endColumn: 4 },
    );
    assert.deepEqual(calls[0].slice(1), [1, 2, false]);
  });
}

test("the semantic command is disabled when Monaco has no focused or active editor", async () => {
  const action = hoverAction();
  const registry = new CommandRegistry({ getContributions: () => [] });
  registerMonaco(registry, action, {
    getFocusedCodeEditor: () => undefined,
    getActiveCodeEditor: () => undefined,
  });
  assert.equal(registry.isEnabled(action.id), false);
  await assert.rejects(registry.executeCommand(action.id), (error) => error.code === "NO_ACTIVE_HANDLER");
});

test("an enabled semantic action returns without a hover when its controller is absent", async () => {
  const action = hoverAction();
  const registry = new CommandRegistry({ getContributions: () => [] });
  let contribution;
  const editor = {
    hasModel: () => true,
    getContribution: (id) => {
      contribution = id;
      return undefined;
    },
    getAction: (id) =>
      id === action.id ? { isSupported: () => true, run: () => action.run(undefined, editor) } : undefined,
  };
  registerMonaco(registry, action, { getFocusedCodeEditor: () => editor, getActiveCodeEditor: () => editor });
  assert.equal(registry.isEnabled(action.id), true);
  await registry.executeCommand(action.id);
  assert.equal(contribution, "editor.contrib.contentHover");
});

function escapeController(dispatch = { kind: 0 }, dropdownVisible = false) {
  const directory = "monaco-editor-core/esm/vs/editor/contrib/hover/browser/";
  const ids = load(`${directory}hoverActionIds.js`, { "../../../../nls.js": localized });
  const keyCodes = load("monaco-editor-core/esm/vs/base/common/keyCodes.js", {});
  const { ContentHoverController } = load(`${directory}contentHoverController.js`, {
    "./hoverActionIds.js": ids,
    "../../../../base/common/lifecycle.js": { Disposable: class {} },
    "../../../../platform/instantiation/common/instantiation.js": { IInstantiationService: () => {} },
    "../../inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.js": {
      InlineSuggestionHintsContentWidget: { dropDownVisible: dropdownVisible },
    },
    "../../../../platform/keybinding/common/keybinding.js": { IKeybindingService: () => {} },
    "../../../../base/common/async.js": {},
    "./hoverUtils.js": {},
    "./contentHoverWidgetWrapper.js": {},
    "./hover.css": {},
    "../../../../base/common/event.js": {},
    "../../colorPicker/browser/hoverColorPicker/hoverColorPicker.js": {},
    "../../../../base/common/keyCodes.js": keyCodes,
    "../../../../platform/contextview/browser/contextView.js": { IContextMenuService: () => {} },
  });
  const controller = Object.create(ContentHoverController.prototype);
  let hides = 0;
  controller._ignoreMouseEvents = false;
  controller._editor = { hasModel: () => true, getDomNode: () => ({}) };
  controller._keybindingService = { softDispatch: () => dispatch };
  controller._contentWidget = {
    isVisible: true,
    isFocused: false,
    hide: () => {
      hides++;
    },
  };
  return { controller, hides: () => hides };
}

test("the installed controller closes hover when it receives unclaimed Escape", () => {
  const { controller, hides } = escapeController();
  controller._onKeyDown({ keyCode: 9 });
  assert.equal(hides(), 1);
});

test("a pending Monaco key sequence preserves hover instead of treating Escape as dismissal", () => {
  const { controller, hides } = escapeController({ kind: 1 });
  controller._onKeyDown({ keyCode: 9 });
  assert.equal(hides(), 0);
});

test("the installed controller does not close hover while the inline-suggestion menu is open", () => {
  const { controller, hides } = escapeController({ kind: 0 }, true);
  controller._onKeyDown({ keyCode: 9 });
  assert.equal(hides(), 0);
});

function notificationContribution() {
  const commands = load("messages/src/browser/notifications-commands.ts", {
    "@theia/core": {
      Command: { toDefaultLocalizedCommand: (value) => value, toLocalizedCommand: (value) => value },
      nls: localized,
    },
    "@theia/core/lib/browser": { codicon: (value) => value },
  });
  const { NotificationsContribution } = load("messages/src/browser/notifications-contribution.ts", {
    "@theia/core/shared/inversify": decorators,
    "@theia/core/lib/browser": {},
    "@theia/core/lib/browser/clipboard-service": {},
    "./notifications-commands": commands,
    "@theia/core": {},
    "./notifications-manager": {},
    "./notifications-renderer": {},
    "@theia/core/lib/browser/color-application-contribution": {},
    "@theia/core/lib/browser/color-registry": {},
    "@theia/core/lib/common/color": {},
    "@theia/core/lib/common/nls": { nls: localized },
    "@theia/core/lib/common/theme": {},
  });
  return Object.create(NotificationsContribution.prototype);
}

function keybindingHandler(registry, notificationsVisible) {
  const { KeybindingRegistry } = load("core/src/browser/keybinding.ts", {
    inversify: { ...decorators, named: () => () => {} },
    "../common/os": {},
    "../common/event": {},
    "../common/command": {},
    "../common/disposable": {},
    "./keyboard/keys": {},
    "./keyboard/keyboard-layout-service": {},
    "../common/contribution-provider": {},
    "../common/logger": {},
    "./status-bar/status-bar": {},
    "./context-key-service": {},
    "../common/core-preferences": {},
    "../common/keybinding": {},
    "../common/nls": { nls: localized },
    "../common/ternary-search-tree": {},
  });
  const handler = Object.create(KeybindingRegistry.prototype);
  handler.commandRegistry = registry;
  handler.contexts = {};
  handler.whenContextService = {
    match: (expression) => {
      assert.equal(expression, "notificationsVisible");
      return notificationsVisible;
    },
  };
  handler.logger = {
    error: (error) => {
      throw error;
    },
  };
  return handler;
}

for (const visible of [true, false]) {
  test(`the notification Escape binding ${visible ? "consumes the event" : "leaves the event for Monaco"}`, async () => {
    const registry = new CommandRegistry({ getContributions: () => [] });
    const contribution = notificationContribution();
    let notificationHides = 0;
    contribution.manager = {
      hide: () => {
        notificationHides++;
      },
    };
    contribution.registerCommands(registry);
    let binding;
    contribution.registerKeybindings({
      registerKeybinding: (value) => {
        binding = value;
      },
    });
    assert.equal(binding.command, "notifications.commands.hide");
    assert.equal(binding.keybinding, "esc");
    assert.equal(binding.when, "notificationsVisible");
    const keys = keybindingHandler(registry, visible);
    const event = {
      target: {},
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
    };
    assert.equal(keys.isEnabled(binding, event), visible);
    if (visible) {
      const completed = new Promise((resolve) => {
        const subscription = registry.onDidExecuteCommand((value) => {
          if (value.commandId === binding.command) {
            subscription.dispose();
            resolve();
          }
        });
      });
      // The document-capture handler consumes the key before the editor target.
      keys.executeKeyBinding(binding, event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.stopped, true);
      await completed;
      assert.equal(notificationHides, 1);
    } else {
      const { controller, hides } = escapeController();
      controller._onKeyDown({ keyCode: 9 });
      assert.equal(event.defaultPrevented, false);
      assert.equal(event.stopped, false);
      assert.equal(notificationHides, 0);
      assert.equal(hides(), 1);
    }
  });
}
