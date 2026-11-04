import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { default: URI } = require("@theia/core/lib/common/uri");
const { Path } = require("@theia/core/lib/common/path");
const decorators = {
  inject: () => () => {},
  injectable: () => (value) => value,
  named: () => () => {},
  postConstruct: () => () => {},
};
const root = path.resolve(import.meta.dirname, "..");

function load(relative, dependencies) {
  const filename = path.join(root, relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
    },
  });
  const module = { exports: {} };
  runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Missing test dependency: ${id}`);
      return dependencies[id];
    },
  });
  return module.exports;
}

function providers() {
  const base = "node_modules/@theia/terminal/src/browser/";
  const common = {
    "@theia/core": { OS: { backend: { isWindows: false } }, Path },
    "@theia/core/lib/common/uri": { default: URI },
    "@theia/core/shared/inversify": decorators,
    "@theia/core/lib/browser": {},
    "@theia/filesystem/lib/browser/file-service": {},
    "./base/terminal-widget": {},
    "./terminal-widget-impl": { TerminalWidgetImpl: class {} },
    "@theia/file-search/lib/common/file-search-service": {},
    "@theia/workspace/lib/browser": {},
  };
  const opening = load(`${base}terminal-file-opening-link-provider.ts`, common);
  const dependencies = { ...common, "./terminal-file-opening-link-provider": opening };
  const files = load(`${base}terminal-file-link-provider.ts`, dependencies);
  const uris = load(`${base}terminal-file-uri-link-provider.ts`, dependencies);
  return load("extensions/agents/src/browser/line-fragment-link-providers.ts", {
    "@theia/core/shared/inversify": decorators,
    "@theia/terminal/lib/browser/terminal-file-link-provider": files,
    "@theia/terminal/lib/browser/terminal-file-uri-link-provider": uris,
  });
}

function fixture(t, Provider) {
  const temporary = path.join(os.tmpdir(), "opencode");
  fs.mkdirSync(temporary, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporary, "ai1-line-links-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const relative = "privacy/contract/contracts/logic/Example.sol";
  const filename = path.join(directory, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, "contract Example {}\n");
  const uri = new URI(`file://${filename}`);
  const opened = [];
  let notifyOpen;
  const openedEvent = new Promise((resolve) => {
    notifyOpen = resolve;
  });
  const searched = [];
  const quickOpen = [];
  const errors = [];
  const provider = new Provider();
  Object.assign(provider, {
    fileService: {
      resolve: async (value) => ({
        isDirectory: (await fs.promises.stat(value.path.toString())).isDirectory(),
      }),
    },
    openerService: {
      getOpener: async () => ({
        open: async (value, options) => {
          opened.push({ uri: value, options });
          notifyOpen();
        },
      }),
    },
    logger: { error: (...args) => errors.push(args) },
    workspaceService: { tryGetRoots: () => [{ resource: new URI(`file://${directory}`) }] },
    searchService: {
      find: async (term) => {
        searched.push(term);
        return filename.endsWith(`/${term}`) ? [uri.toString()] : [];
      },
    },
    quickInputService: { open: (value) => quickOpen.push(value) },
  });
  return {
    provider,
    relative,
    uri,
    opened,
    openedEvent,
    searched,
    quickOpen,
    errors,
    terminal: { lastCwd: new URI(`file://${directory}`) },
  };
}

for (const name of [
  "LineFragmentFileLinkProvider",
  "LineFragmentLocalFileLinkProvider",
  "LineFragmentFileUriLinkProvider",
]) {
  test(`${name} opens a Markdown target at its #L line`, async (t) => {
    const f = fixture(t, providers()[name]);
    const target = name === "LineFragmentFileUriLinkProvider" ? f.uri.toString() : f.relative;
    const link = `${target}#L355`;
    const text = `- [Example.sol:355](${link}) rejects a transfer`;
    const links = await f.provider.provideLinks(text, f.terminal);
    const match = links.find((entry) => entry.startIndex === text.indexOf(link));
    assert.ok(match, "The complete target has a file link.");
    assert.equal(match.length, link.length);
    await match.handle();
    assert.deepEqual(f.quickOpen, []);
    await f.openedEvent;
    assert.equal(f.opened.length, 1);
    assert.equal(f.opened[0].uri.toString(), f.uri.toString());
    assert.equal(f.opened[0].options.selection.start.line, 354);
    assert.equal(f.opened[0].options.selection.start.character, 0);
    assert.deepEqual(f.quickOpen, []);
    assert.deepEqual(f.errors, []);
  });
}

test("workspace fallback searches without the line fragment", async (t) => {
  const f = fixture(t, providers().LineFragmentLocalFileLinkProvider);
  const links = await f.provider.provideLinks(`${f.relative}#L305-L310`, f.terminal);
  await links[0].handle();
  assert.deepEqual(f.searched, [f.relative]);
  assert.deepEqual(f.quickOpen, []);
  await f.openedEvent;
  assert.equal(f.opened[0].options.selection.start.line, 304);
});

test("ordinary colon positions and literal hash filenames remain valid", async (t) => {
  const f = fixture(t, providers().LineFragmentFileLinkProvider);
  for (const [suffix, line, character] of [
    [":12:3", 11, 2],
    ["#L12C3", 11, 2],
  ]) {
    const links = await f.provider.provideLinks(`${f.relative}${suffix}`, f.terminal);
    await links[0].handle();
    const position = f.opened.at(-1).options.selection.start;
    assert.equal(position.line, line);
    assert.equal(position.character, character);
  }
  const literal = f.uri.path.toString().replace("Example.sol", "Example#notes.sol");
  fs.writeFileSync(literal, "contract Example {}\n");
  const links = await f.provider.provideLinks(literal, f.terminal);
  await links[0].handle();
  assert.equal(f.opened.at(-1).uri.path.toString(), literal);
});

test("missing targets and HTTP URLs do not become local fragment links", async (t) => {
  const f = fixture(t, providers().LineFragmentFileLinkProvider);
  for (const target of ["missing/Example.sol#L305", "https://example.test/Example.sol#L305"]) {
    assert.equal((await f.provider.provideLinks(target, f.terminal)).length, 0);
  }
  assert.deepEqual(f.opened, []);
});

test("Command-click opens a fragment link through Theia's terminal adapter", async (t) => {
  const f = fixture(t, providers().LineFragmentFileLinkProvider);
  const [link] = await f.provider.provideLinks(`${f.relative}#L305`, f.terminal);
  const { XtermLinkAdapter } = load("node_modules/@theia/terminal/src/browser/terminal-link-provider.ts", {
    "@theia/core": {
      isOSX: true,
      DisposableCollection: class {
        dispose() {}
      },
    },
    "@theia/core/lib/common": {},
    "@theia/core/shared/inversify": decorators,
    "./terminal-link-helpers": {},
    "./terminal-widget-impl": {},
  });
  const adapter = new XtermLinkAdapter();
  let focusCount = 0;
  Object.assign(adapter, {
    link,
    terminalWidget: {
      getTerminal: () => ({ focus: () => focusCount++ }),
      hideLinkHover: () => {},
    },
  });
  adapter.activate({ metaKey: false, preventDefault() {} }, "");
  assert.equal(focusCount, 1);
  assert.deepEqual(f.opened, []);
  adapter.activate({ metaKey: true, preventDefault() {} }, "");
  await f.openedEvent;
  assert.equal(f.opened[0].uri.toString(), f.uri.toString());
  assert.equal(f.opened[0].options.selection.start.line, 304);
});
