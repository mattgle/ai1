# AI1 M1 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A packaged AI1 desktop app that opens a meta-repo folder with the explorer (Material icons) on the left, a native Changes view on the right, editor and diffs in the center, TypeScript IntelliSense, and ESLint fix on save.

**Architecture:** An npm workspaces monorepo. One Electron application package composes pinned `@theia/*` packages. Three Theia extensions of our own hold all AI1 user interface code: `material-icons` (file icon theme from the pinned npm package), `changes-view` (Node back-end git service, tree widget, diff), and `shell-layout` (default layout, default preferences, Theia AI features off). Only language extensions (TypeScript, ESLint, and others) are VS Code extensions, downloaded from Open VSX at build time.

**Tech Stack:** Eclipse Theia 1.75.0, Electron 42.8.1, Node 24, npm workspaces, TypeScript, React (through Theia), esbuild (through Theia), electron-builder, mocha, `@theia/playwright`.

**Spec:** `docs/superpowers/specs/2026-09-21-ai1-design.md`

## Global Constraints

- All `@theia/*` packages at exactly `1.75.0`. No `^` and no `~`.
- `electron` at exactly `42.8.1`. `material-icon-theme` at exactly `5.38.1`.
- Node 24. Package manager: npm with workspaces. No lerna, no yarn.
- Platform: macOS arm64 only.
- The AI1 user interface is native Theia code. No task adds a VS Code extension for an AI1 panel.
- No custom extension depends on a different custom extension.
- Packaging uses ad-hoc signing. The build never uses automatic certificate discovery: `CSC_IDENTITY_AUTO_DISCOVERY=false` is always set.
- Native builds use `CC=/usr/bin/cc CXX=/usr/bin/c++`.
- Code style: 2 spaces, double quotes, Prettier with `printWidth: 110`. Run `npm run format` on new files. The line breaks that Prettier makes are correct; the line breaks in this plan are not binding.
- Injected fields use the `!` mark (`protected readonly x!: X;`), because `strict` is on.
- Test files contain no divider comments (for example `// --- section ---`).
- Commit messages contain no `Co-Authored-By` line and no other attribution line.
- Commit messages, comments, and documents contain none of these: local user names, home folder paths, names of private projects.
- Lint, type check, unit tests, and format check pass before each commit: `npm run lint && npm run typecheck && npm test && npm run format:check`.

## Facts about Theia 1.75.0 that this plan relies on

All were read from the installed packages. An implementer who gets a compile error against one of them reads the cited file and applies the smallest correction.

- Theia 1.75.0 builds with esbuild. The generated files are `gen-esbuild.*.mjs`; `esbuild.mjs` is user-editable. The rebuild step makes a `.browser_modules/` cache folder.
- RPC: back end `RpcConnectionHandler` from `@theia/core/lib/common`; front end `ServiceConnectionProvider.createProxy(container, path)` from `@theia/core/lib/browser/messaging/service-connection-provider`. Pattern: `@theia/file-search` (`src/node/file-search-backend-module.ts`) and `@theia/search-in-workspace` (`src/browser/search-in-workspace-frontend-module.ts`).
- Tree widget pattern: `@theia/outline-view` (`src/browser/outline-view-widget.tsx`, `outline-view-frontend-module.ts`, `outline-view-contribution.ts`, `outline-view-tree-model.ts`). A single click does not open a node; `tapNode` must do it. No `expandAll` exists; it is written by hand. `renderIcon` returns `null` in the base class. Setting `model.root` refreshes the tree; node ids must stay stable, and the `expanded` flag is copied by hand.
- Row buttons pattern: `@theia/markers` (`src/browser/problem/problem-widget.tsx`, `renderTailDecorations`).
- Toolbar items are limited to one widget through the command's `isVisible(widget)`.
- `LabelProvider.getIcon(uri)` returns the icon class of the active icon theme for a `URI`.
- Diff: `DiffUris.encode(left, right, label)` from `@theia/core/lib/browser/diff-uris`, opened with `open(openerService, uri)`. Content for a custom scheme comes from a `ResourceResolver` (pattern: `@theia/debug` `src/browser/debug-resource.ts`).
- `FileService.onDidFilesChange` gives `FileChangesEvent` with `changes[].resource: URI`.
- `WorkspaceService.roots: Promise<FileStat[]>`, `onWorkspaceChanged`.
- `ConfirmDialog` from `@theia/core/lib/browser/dialogs`: `new ConfirmDialog({ title, msg, ok, cancel }).open()` resolves to `true` on OK.
- Icon themes: `IconThemeService.register(theme)`, `IconThemeContribution`, pattern `DefaultFileIconThemeContribution` in `@theia/core` (`src/browser/icon-theme-contribution.ts`). A theme that registers late becomes active when its id equals the `workbench.iconTheme` preference, whose default is `theia.frontend.config.defaultIconTheme`. Theia's `PluginIconTheme` cannot be used outside `@theia/plugin-ext`, because it builds URLs for deployed plugins only.
- `BackendApplicationContribution.configure(app: express.Application)` lets a back-end module add an express route. `express` comes from `@theia/core/shared/express`.
- `Endpoint` from `@theia/core/lib/browser/endpoint`: `new Endpoint({ path }).getRestUrl()` gives the `http://localhost:<port>/...` URL of the back end, also in Electron.
- `material-icon-theme@5.38.1`: manifest `dist/material-icons.json`, 1251 SVG files in `icons/`, icon paths in the form `./../icons/git.svg`. The manifest maps `ts`, `spec.ts` (file extensions), `package.json` (file name), and `src` (folder name) directly.
- `@theia/plugin-ext` depends on `@theia/ai-core`. `AIActivationServiceImpl` sets `isActive = true` and `canRun = true`. `AIActivationService` and `ENABLE_AI_CONTEXT_KEY` come from `@theia/ai-core/lib/browser/ai-activation-service`.
- `@theia/playwright`: `TheiaAppLoader.load({ playwright, browser, useElectron: { electronAppPath, pluginsPath } }, workspace)`; the environment variable `USE_ELECTRON=true` selects Electron.

## File Structure

```
ai1/
├── package.json                          workspaces, scripts, theiaPlugins list
├── applications/electron/
│   ├── package.json
│   ├── scripts/ai1-electron-main.js      sets the plugins folder and the icons folder, starts Theia
│   ├── scripts/copy-material-icons.mjs   copies the icon files from the npm package (Task 3)
│   ├── electron-builder.yml              (Task 7)
│   ├── plugins/                          build output, not in git
│   └── resources/material-icons/         build output, not in git
├── extensions/
│   ├── material-icons/src/
│   │   ├── common/material-icon-resolver.ts      file or folder name -> icon id (pure)
│   │   ├── common/material-icon-css.ts           manifest -> style sheet text (pure)
│   │   ├── common/material-icons-protocol.ts     route, environment variable name, manifest type
│   │   ├── node/material-icons-backend-contribution.ts   express static route
│   │   ├── node/material-icons-backend-module.ts
│   │   ├── browser/material-icon-theme.ts        icon theme + label provider
│   │   └── browser/material-icons-frontend-module.ts
│   ├── changes-view/src/
│   │   ├── common/changes-protocol.ts            RPC path, service interface, data types
│   │   ├── common/git-status.ts                  porcelain parser, status letter, discard plan, prompts (pure)
│   │   ├── common/refresh-filter.ts              paths that must not start a refresh (pure)
│   │   ├── common/head-uri.ts                    URI of a file at HEAD
│   │   ├── node/git-runner.ts                    runs git
│   │   ├── node/changes-service-impl.ts          scan, read HEAD, discard
│   │   ├── node/changes-backend-module.ts
│   │   ├── browser/changes-tree.ts               tree nodes from scan results (pure)
│   │   ├── browser/changes-widget.tsx            the tree widget
│   │   ├── browser/head-resource-resolver.ts     HEAD content for the diff editor
│   │   ├── browser/changes-contribution.ts       view, commands, toolbar
│   │   ├── browser/changes-frontend-module.ts
│   │   └── browser/style/changes.css
│   └── shell-layout/src/browser/
│       ├── default-preferences.ts  default-preferences-contribution.ts
│       ├── ai-features-off-service.ts
│       ├── shell-layout-contribution.ts
│       └── shell-layout-frontend-module.ts
├── e2e/                                  (Task 8)
├── scripts/package-mac.sh                (Task 7)
└── docs/m1-measurements.md               (Task 9)
```

Each extension has the same two package files. They are given once per task, in full.

---

### Task 1: Workspace skeleton and an Electron app that starts

**Status: complete.** Commit `034e4e3`. The root package, the application package, the main script, ESLint, Prettier, and the base TypeScript config exist. `npm run build` and `npm start` work. `.prettierignore` lists `docs/`, `package-lock.json`, `.browser_modules/`, `.superpowers/`, and the generated esbuild files.

---

### Task 2: Language extensions from Open VSX

**Files:**
- Modify: `package.json` (the `theiaPlugins` object)

**Interfaces:**
- Consumes: the plugins folder `applications/electron/plugins` and the root script `download:plugins` from Task 1.
- Produces: 15 unpacked language extensions in the plugins folder. No task depends on a single one of them by name.

**Start state:** the working tree has uncommitted changes from a stopped earlier attempt: `package.json` has 16 `theiaPlugins` entries, `package-lock.json` has entries of a workspace that no longer exists, and the plugins folder holds 17 folders.

- [ ] **Step 1: Set the `theiaPlugins` object**

The object in the root `package.json` must be exactly this (15 entries, no icon theme):

```json
  "theiaPlugins": {
    "vscode.typescript": "https://open-vsx.org/api/vscode/typescript/1.95.3/file/vscode.typescript-1.95.3.vsix",
    "vscode.typescript-language-features": "https://open-vsx.org/api/vscode/typescript-language-features/1.95.3/file/vscode.typescript-language-features-1.95.3.vsix",
    "vscode.javascript": "https://open-vsx.org/api/vscode/javascript/1.95.3/file/vscode.javascript-1.95.3.vsix",
    "vscode.json": "https://open-vsx.org/api/vscode/json/1.95.3/file/vscode.json-1.95.3.vsix",
    "vscode.json-language-features": "https://open-vsx.org/api/vscode/json-language-features/1.95.3/file/vscode.json-language-features-1.95.3.vsix",
    "vscode.css": "https://open-vsx.org/api/vscode/css/1.95.3/file/vscode.css-1.95.3.vsix",
    "vscode.css-language-features": "https://open-vsx.org/api/vscode/css-language-features/1.95.3/file/vscode.css-language-features-1.95.3.vsix",
    "vscode.html": "https://open-vsx.org/api/vscode/html/1.95.3/file/vscode.html-1.95.3.vsix",
    "vscode.html-language-features": "https://open-vsx.org/api/vscode/html-language-features/1.95.3/file/vscode.html-language-features-1.95.3.vsix",
    "vscode.markdown": "https://open-vsx.org/api/vscode/markdown/1.95.3/file/vscode.markdown-1.95.3.vsix",
    "vscode.markdown-language-features": "https://open-vsx.org/api/vscode/markdown-language-features/1.95.3/file/vscode.markdown-language-features-1.95.3.vsix",
    "vscode.git-base": "https://open-vsx.org/api/vscode/git-base/1.95.3/file/vscode.git-base-1.95.3.vsix",
    "vscode.git": "https://open-vsx.org/api/vscode/git/1.95.3/file/vscode.git-1.95.3.vsix",
    "vscode.theme-defaults": "https://open-vsx.org/api/vscode/theme-defaults/1.95.3/file/vscode.theme-defaults-1.95.3.vsix",
    "dbaeumer.vscode-eslint": "https://open-vsx.org/api/dbaeumer/vscode-eslint/3.0.34/file/dbaeumer.vscode-eslint-3.0.34.vsix"
  }
```

- [ ] **Step 2: Clean the lock file and the plugins folder**

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm install
rm -rf applications/electron/plugins
npm run download:plugins
ls applications/electron/plugins | wc -l
git status --short
```
Expected: the count is `15`. `git status` shows `package.json` as modified. `package-lock.json` is either unchanged against `HEAD` or has only changes that come from this `package.json`. If `package-lock.json` still names `vscode-extensions/metarepo-sc`, run `git checkout package-lock.json && npm install`.

- [ ] **Step 3: Check that the extensions load**

Make a temporary folder outside the repository with one `index.ts` file. Run `npm run build`. Start the app in the background with that folder as the argument (`npm start --workspace applications/electron -- <folder>`), and write the output to a log file for 90 seconds. Then stop the process tree and delete the folder.

Expected in the log: the plugin host starts, and lines name `typescript-language-features`, `vscode.git`, and `vscode-eslint`. No line reports a failed plugin deployment. Put the relevant lines in the report.

- [ ] **Step 4: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors.

```bash
git add package.json package-lock.json
git commit -m "Download the language extensions from Open VSX" -m "The build downloads 15 VS Code extensions at pinned versions: TypeScript, JavaScript, JSON, CSS, HTML, Markdown, Git, the default themes, and ESLint. They give IntelliSense and lint. The AI1 panels are not among them."
```

---

### Task 3: The `material-icons` extension

**Files:**
- Create: `extensions/material-icons/package.json`, `extensions/material-icons/tsconfig.json`
- Create: `extensions/material-icons/src/common/material-icons-protocol.ts`
- Create: `extensions/material-icons/src/common/material-icon-resolver.ts`, test `material-icon-resolver.spec.ts`
- Create: `extensions/material-icons/src/common/material-icon-css.ts`, test `material-icon-css.spec.ts`
- Create: `extensions/material-icons/src/node/material-icons-backend-contribution.ts`, `material-icons-backend-module.ts`
- Create: `extensions/material-icons/src/browser/material-icon-theme.ts`, `material-icons-frontend-module.ts`
- Create: `applications/electron/scripts/copy-material-icons.mjs`
- Modify: `applications/electron/scripts/ai1-electron-main.js`, `applications/electron/package.json`, `.gitignore`

**Interfaces:**
- Consumes: `theia.frontend.config.defaultIconTheme: "material-icon-theme"` from Task 1.
- Produces:
  - Icon theme id `material-icon-theme`. `LabelProvider.getIcon(uri)` returns `"ai1-mi ai1-mi-<iconId>"` while the theme is active. Task 5 uses this through `LabelProvider`.
  - Environment variable `AI1_MATERIAL_ICONS_DIR`, set by the main script. Folder `applications/electron/resources/material-icons/` with `dist/material-icons.json` and `icons/`. Task 7 packages this folder.
  - Back-end route `/ai1-material-icons`.

- [ ] **Step 1: Create the package files**

`extensions/material-icons/package.json`:
```json
{
  "name": "ai1-material-icons",
  "version": "0.1.0",
  "private": true,
  "description": "Material file icons of AI1, from the pinned material-icon-theme npm package",
  "keywords": ["theia-extension"],
  "files": ["lib", "src"],
  "dependencies": {
    "@theia/core": "1.75.0",
    "@theia/filesystem": "1.75.0",
    "material-icon-theme": "5.38.1"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "^20.0.0",
    "mocha": "^10.0.0",
    "rimraf": "^5.0.0",
    "typescript": "~5.4.5"
  },
  "scripts": {
    "clean": "rimraf lib",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "tsc && mocha \"lib/**/*.spec.js\""
  },
  "theiaExtensions": [
    {
      "frontend": "lib/browser/material-icons-frontend-module",
      "backend": "lib/node/material-icons-backend-module"
    }
  ]
}
```

`extensions/material-icons/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib",
    "types": ["node", "mocha"]
  },
  "include": ["src"]
}
```

Run: `npm install`
Expected: no error. `node_modules/material-icon-theme/dist/material-icons.json` exists.

- [ ] **Step 2: Create the protocol file**

`extensions/material-icons/src/common/material-icons-protocol.ts`:
```ts
// The back end serves the icon files of the material-icon-theme package under this route.
export const MATERIAL_ICONS_ROUTE = "/ai1-material-icons";

// The Electron main script sets this variable to the folder that holds
// `dist/material-icons.json` and `icons/`.
export const MATERIAL_ICONS_DIR_ENV = "AI1_MATERIAL_ICONS_DIR";

export const MATERIAL_ICONS_MANIFEST_PATH = "dist/material-icons.json";

// The part of the VS Code icon theme format that AI1 uses.
export interface MaterialIconManifest {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
}
```

- [ ] **Step 3: Write the failing resolver test**

`extensions/material-icons/src/common/material-icon-resolver.spec.ts`:
```ts
import * as assert from "node:assert";
import * as fs from "node:fs";
import { resolveIconId } from "./material-icon-resolver";
import { MaterialIconManifest } from "./material-icons-protocol";

const manifest: MaterialIconManifest = {
  iconDefinitions: {},
  fileNames: { "package.json": "nodejs" },
  fileExtensions: { ts: "typescript", "spec.ts": "test-ts" },
  folderNames: { src: "folder-src" },
  folderNamesExpanded: { src: "folder-src-open" },
  file: "file",
  folder: "folder",
  folderExpanded: "folder-open",
};

describe("resolveIconId", () => {
  it("uses the file name before the extension", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "package.json", kind: "file", expanded: false }), "nodejs");
  });

  it("uses the longest extension that matches", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "app.spec.ts", kind: "file", expanded: false }), "test-ts");
  });

  it("uses a shorter extension when the longest one does not match", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "app.view.ts", kind: "file", expanded: false }), "typescript");
  });

  it("ignores the case of the name", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "Index.TS", kind: "file", expanded: false }), "typescript");
  });

  it("uses the default file icon when nothing matches", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "notes.unknown", kind: "file", expanded: false }), "file");
  });

  it("uses the default file icon for a name with no extension", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "LICENSE", kind: "file", expanded: false }), "file");
  });

  it("uses the folder name", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "src", kind: "folder", expanded: false }), "folder-src");
  });

  it("uses the expanded folder name for an expanded folder", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "src", kind: "folder", expanded: true }), "folder-src-open");
  });

  it("uses the default folder icons when the folder name does not match", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "stuff", kind: "folder", expanded: false }), "folder");
    assert.strictEqual(resolveIconId(manifest, { name: "stuff", kind: "folder", expanded: true }), "folder-open");
  });
});

describe("resolveIconId with the manifest of the material-icon-theme package", () => {
  const real: MaterialIconManifest = JSON.parse(
    fs.readFileSync(require.resolve("material-icon-theme/dist/material-icons.json"), "utf8"),
  );

  it("finds an icon definition for a TypeScript file", () => {
    const id = resolveIconId(real, { name: "index.ts", kind: "file", expanded: false });
    assert.strictEqual(id, "typescript");
    assert.ok(real.iconDefinitions[id]);
  });

  it("finds an icon definition for each default", () => {
    for (const id of [real.file, real.folder, real.folderExpanded]) {
      assert.ok(real.iconDefinitions[id], `no icon definition for ${id}`);
    }
  });
});
```

- [ ] **Step 4: Run the test to make sure that it fails**

Run: `npm test --workspace extensions/material-icons`
Expected: FAIL. `tsc` reports `Cannot find module './material-icon-resolver'`.

- [ ] **Step 5: Write the resolver**

`extensions/material-icons/src/common/material-icon-resolver.ts`:
```ts
import { MaterialIconManifest } from "./material-icons-protocol";

export interface IconTarget {
  // The base name of the file or the folder, with no path.
  name: string;
  kind: "file" | "folder";
  // Applies to folders only.
  expanded: boolean;
}

// Returns the id of the icon definition for a file or a folder. The order is
// the order of the VS Code icon theme format: file name, then the longest
// extension, then the default.
export function resolveIconId(manifest: MaterialIconManifest, target: IconTarget): string {
  const name = target.name.toLowerCase();
  if (target.kind === "folder") {
    return target.expanded
      ? manifest.folderNamesExpanded[name] ?? manifest.folderExpanded
      : manifest.folderNames[name] ?? manifest.folder;
  }
  const byName = manifest.fileNames[name];
  if (byName) {
    return byName;
  }
  for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
    const byExtension = manifest.fileExtensions[name.slice(dot + 1)];
    if (byExtension) {
      return byExtension;
    }
  }
  return manifest.file;
}
```

- [ ] **Step 6: Run the test to make sure that it passes**

Run: `npm test --workspace extensions/material-icons`
Expected: PASS, `11 passing`.

- [ ] **Step 7: Write the failing CSS test**

`extensions/material-icons/src/common/material-icon-css.spec.ts`:
```ts
import * as assert from "node:assert";
import { buildStyleSheet, iconClass, ICON_BASE_CLASS } from "./material-icon-css";

describe("iconClass", () => {
  it("adds the prefix to the icon id", () => {
    assert.strictEqual(iconClass("folder-src-open"), "ai1-mi-folder-src-open");
  });

  it("replaces characters that are not safe in a CSS class", () => {
    assert.strictEqual(iconClass("c++.v2"), "ai1-mi-c___v2");
  });
});

describe("buildStyleSheet", () => {
  const css = buildStyleSheet(
    { typescript: { iconPath: "./../icons/typescript.svg" }, file: { iconPath: "./../icons/file.svg" } },
    (iconPath) => `http://host/base/${iconPath.replace("./../", "")}`,
  );

  it("writes one rule for each icon definition", () => {
    assert.ok(css.includes(".ai1-mi-typescript::before { background-image: url('http://host/base/icons/typescript.svg'); }"));
    assert.ok(css.includes(".ai1-mi-file::before { background-image: url('http://host/base/icons/file.svg'); }"));
  });

  it("writes the shared rule one time", () => {
    assert.strictEqual(css.split(`.${ICON_BASE_CLASS}::before {`).length - 1, 1);
  });
});
```

- [ ] **Step 8: Run the test to make sure that it fails, then write the CSS builder**

Run: `npm test --workspace extensions/material-icons`
Expected: FAIL. `tsc` reports `Cannot find module './material-icon-css'`.

`extensions/material-icons/src/common/material-icon-css.ts`:
```ts
export const ICON_BASE_CLASS = "ai1-mi";

export function iconClass(iconId: string): string {
  return `${ICON_BASE_CLASS}-${iconId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// Builds the style sheet of the icon theme. Each icon is a background image on
// the `::before` element, which is how Theia's own icon themes draw file icons.
export function buildStyleSheet(
  iconDefinitions: Record<string, { iconPath: string }>,
  urlOf: (iconPath: string) => string,
): string {
  const rules = [
    `.${ICON_BASE_CLASS}::before {`,
    "  content: ' ';",
    "  display: inline-block;",
    "  width: 16px;",
    "  height: 16px;",
    "  vertical-align: middle;",
    "  background-size: 16px;",
    "  background-position: left center;",
    "  background-repeat: no-repeat;",
    "}",
  ];
  for (const [iconId, definition] of Object.entries(iconDefinitions)) {
    rules.push(`.${iconClass(iconId)}::before { background-image: url('${urlOf(definition.iconPath)}'); }`);
  }
  return rules.join("\n");
}
```

Run: `npm test --workspace extensions/material-icons`
Expected: PASS, `15 passing`.

- [ ] **Step 9: Write the back-end contribution and module**

`extensions/material-icons/src/node/material-icons-backend-contribution.ts`:
```ts
import * as express from "@theia/core/shared/express";
import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node/backend-application";
import { MATERIAL_ICONS_DIR_ENV, MATERIAL_ICONS_ROUTE } from "../common/material-icons-protocol";

// Serves the manifest and the SVG files of the material-icon-theme package to the front end.
@injectable()
export class MaterialIconsBackendContribution implements BackendApplicationContribution {
  configure(app: express.Application): void {
    const directory = process.env[MATERIAL_ICONS_DIR_ENV];
    if (!directory) {
      console.warn(`ai1-material-icons: ${MATERIAL_ICONS_DIR_ENV} is not set. The Material icons do not load.`);
      return;
    }
    app.use(MATERIAL_ICONS_ROUTE, express.static(directory, { maxAge: "1d" }));
  }
}
```

`extensions/material-icons/src/node/material-icons-backend-module.ts`:
```ts
import { BackendApplicationContribution } from "@theia/core/lib/node/backend-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MaterialIconsBackendContribution } from "./material-icons-backend-contribution";

export default new ContainerModule((bind) => {
  bind(MaterialIconsBackendContribution).toSelf().inSingletonScope();
  bind(BackendApplicationContribution).toService(MaterialIconsBackendContribution);
});
```

- [ ] **Step 10: Write the icon theme**

`extensions/material-icons/src/browser/material-icon-theme.ts`:
```ts
import { Disposable, Emitter, Event } from "@theia/core";
import { Endpoint } from "@theia/core/lib/browser/endpoint";
import { IconTheme, IconThemeService } from "@theia/core/lib/browser/icon-theme-service";
import { IconThemeContribution } from "@theia/core/lib/browser/icon-theme-contribution";
import {
  DidChangeLabelEvent,
  LabelProviderContribution,
  URIIconReference,
} from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { injectable } from "@theia/core/shared/inversify";
import { FileStatNode } from "@theia/filesystem/lib/browser/file-tree";
import { FileStat } from "@theia/filesystem/lib/common/files";
import { buildStyleSheet, iconClass, ICON_BASE_CLASS } from "../common/material-icon-css";
import { IconTarget, resolveIconId } from "../common/material-icon-resolver";
import {
  MATERIAL_ICONS_MANIFEST_PATH,
  MATERIAL_ICONS_ROUTE,
  MaterialIconManifest,
} from "../common/material-icons-protocol";

type IconElement = URI | URIIconReference | FileStat | FileStatNode;

@injectable()
export class MaterialIconTheme implements IconTheme, IconThemeContribution, LabelProviderContribution {
  readonly id = "material-icon-theme";
  readonly label = "Material Icon Theme";
  readonly hasFileIcons = true;
  readonly hasFolderIcons = true;

  protected manifest: MaterialIconManifest | undefined;
  protected active = false;
  protected styleElement: HTMLStyleElement | undefined;

  protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
  get onDidChange(): Event<DidChangeLabelEvent> {
    return this.onDidChangeEmitter.event;
  }

  registerIconThemes(iconThemes: IconThemeService): void {
    iconThemes.register(this);
  }

  activate(): Disposable {
    this.active = true;
    this.load().catch((error) => console.error("ai1-material-icons: the manifest did not load", error));
    return Disposable.create(() => {
      this.active = false;
      this.styleElement?.remove();
      this.styleElement = undefined;
      this.onDidChangeEmitter.fire({ affects: () => true });
    });
  }

  canHandle(element: object): number {
    if (!this.active || !this.manifest) {
      return 0;
    }
    const isFileUri = element instanceof URI && element.scheme === "file";
    return isFileUri || URIIconReference.is(element) || FileStat.is(element) || FileStatNode.is(element)
      ? Number.MAX_SAFE_INTEGER
      : 0;
  }

  getIcon(element: IconElement): string | undefined {
    if (!this.manifest) {
      return undefined;
    }
    return `${ICON_BASE_CLASS} ${iconClass(resolveIconId(this.manifest, this.toTarget(element)))}`;
  }

  protected toTarget(element: IconElement): IconTarget {
    if (FileStatNode.is(element)) {
      const expanded = (element as { expanded?: boolean }).expanded === true;
      return { name: element.fileStat.name, kind: element.fileStat.isDirectory ? "folder" : "file", expanded };
    }
    if (FileStat.is(element)) {
      return { name: element.name, kind: element.isDirectory ? "folder" : "file", expanded: false };
    }
    if (URIIconReference.is(element)) {
      return { name: element.uri?.path.base ?? "", kind: element.id === "folder" ? "folder" : "file", expanded: false };
    }
    return { name: element.path.base, kind: "file", expanded: false };
  }

  protected async load(): Promise<void> {
    const manifestUrl = new Endpoint({ path: `${MATERIAL_ICONS_ROUTE}/${MATERIAL_ICONS_MANIFEST_PATH}` })
      .getRestUrl()
      .toString();
    if (!this.manifest) {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`${manifestUrl} gives status ${response.status}`);
      }
      this.manifest = (await response.json()) as MaterialIconManifest;
    }
    if (!this.active) {
      return;
    }
    // The manifest gives each icon path relative to its own folder, for example "./../icons/git.svg".
    const css = buildStyleSheet(this.manifest.iconDefinitions, (iconPath) => new URL(iconPath, manifestUrl).toString());
    this.styleElement?.remove();
    this.styleElement = document.createElement("style");
    this.styleElement.id = "ai1-material-icons";
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
    this.onDidChangeEmitter.fire({ affects: () => true });
  }
}
```

- [ ] **Step 11: Write the front-end module**

`extensions/material-icons/src/browser/material-icons-frontend-module.ts`:
```ts
import { IconThemeContribution } from "@theia/core/lib/browser/icon-theme-contribution";
import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MaterialIconTheme } from "./material-icon-theme";

export default new ContainerModule((bind) => {
  bind(MaterialIconTheme).toSelf().inSingletonScope();
  bind(IconThemeContribution).toService(MaterialIconTheme);
  bind(LabelProviderContribution).toService(MaterialIconTheme);
});
```

- [ ] **Step 12: Copy the icon files at build time and give the folder to the back end**

`applications/electron/scripts/copy-material-icons.mjs`:
```js
// Copies the manifest and the SVG files of the material-icon-theme package into
// the application package. The packaged app has no node_modules folder, so the
// back end reads the icons from this copy.
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"));
const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(applicationRoot, "resources", "material-icons");

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "dist"), { recursive: true });
await cp(path.join(packageRoot, "dist", "material-icons.json"), path.join(target, "dist", "material-icons.json"));
await cp(path.join(packageRoot, "icons"), path.join(target, "icons"), { recursive: true });
console.log(`Material icons copied to ${target}`);
```

In `applications/electron/scripts/ai1-electron-main.js`, add one line after the `THEIA_DEFAULT_PLUGINS` line, and extend the comment. The full file becomes:
```js
// Entry point of the Electron app. It tells Theia where the bundled VS Code
// extensions and the Material icon files are, then it starts the generated
// Theia main module. Both folders have the same relative position in
// development and in the packaged app.
const path = require("path");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;
process.env.AI1_MATERIAL_ICONS_DIR = path.resolve(__dirname, "..", "resources", "material-icons");

require("../lib/backend/electron-main.js");
```

In `applications/electron/package.json`:
- add to `dependencies`: `"ai1-material-icons": "0.1.0"`
- add to `scripts`: `"copy:icons": "node scripts/copy-material-icons.mjs"`
- change `build` to `"npm run copy:icons && npm run rebuild && theia build --mode development"`
- change `build:production` to `"npm run copy:icons && npm run rebuild && theia build --mode production"`

Add to `.gitignore`: `applications/electron/resources/material-icons`

- [ ] **Step 13: Build and check**

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm install
npm run build
ls applications/electron/resources/material-icons/icons | wc -l
```
Expected: no build error. The count is `1251`.

Start the app in the background on a temporary folder that holds `index.ts`, `package.json`, and a `src/` folder. While it runs, find the back-end port in the log and request the manifest and one icon:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/ai1-material-icons/dist/material-icons.json"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/ai1-material-icons/icons/typescript.svg"
```
Expected: `200` for the two requests. The log has no `ai1-material-icons` warning and no error. Stop the app and delete the folder. List "the explorer shows Material icons, and an expanded `src` folder shows the open-folder icon" under "Visual checks for the user".

- [ ] **Step 14: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors, `15 passing` for this workspace.

```bash
git add extensions/material-icons applications/electron/scripts applications/electron/package.json .gitignore package-lock.json
git commit -m "Add the native Material icon theme" -m "The extension registers a file icon theme with the Theia icon theme service. A pure resolver maps a file or folder name to an icon of the pinned material-icon-theme package. The back end serves the icon files from a copy that the build makes inside the application package."
```

---

### Task 4: The `changes-view` back end

**Files:**
- Create: `extensions/changes-view/package.json`, `extensions/changes-view/tsconfig.json`
- Create: `extensions/changes-view/src/common/changes-protocol.ts`
- Create: `extensions/changes-view/src/common/git-status.ts`, test `git-status.spec.ts`
- Create: `extensions/changes-view/src/common/refresh-filter.ts`, test `refresh-filter.spec.ts`
- Create: `extensions/changes-view/src/node/git-runner.ts`
- Create: `extensions/changes-view/src/node/changes-service-impl.ts`, test `changes-service-impl.spec.ts`
- Create: `extensions/changes-view/src/node/changes-backend-module.ts`

**Interfaces:**
- Consumes: nothing from other custom extensions.
- Produces (Task 5 uses every name here):
  - `CHANGES_SERVICE_PATH = "/services/ai1-changes"`, `ChangesService` symbol and interface
  - `interface FileChangeEntry { status: string; path: string; sourcePath?: string }`
  - `interface RepoChanges { name: string; rootUri: string; branch: string; files: FileChangeEntry[] }`
  - `scan(workspaceRootUris: string[]): Promise<RepoChanges[]>`, `readHead(repoRootUri: string, path: string): Promise<string>`, `discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void>`, `discardAll(repoRootUri: string): Promise<void>`
  - `statusBadge(status: string): string`, `isUntracked(entry: FileChangeEntry): boolean`, `discardPrompt(entry: FileChangeEntry): DiscardPrompt`, `discardAllPrompt(repoName: string, changeCount: number): DiscardPrompt`, `interface DiscardPrompt { title: string; msg: string; ok: string }`
  - `shouldIgnorePath(fsPath: string): boolean`

- [ ] **Step 1: Create the package files**

`extensions/changes-view/package.json`:
```json
{
  "name": "ai1-changes-view",
  "version": "0.1.0",
  "private": true,
  "description": "The Changes view of AI1: repositories with uncommitted changes, their files, diffs, and discard",
  "keywords": ["theia-extension"],
  "files": ["lib", "src"],
  "dependencies": {
    "@theia/core": "1.75.0",
    "@theia/filesystem": "1.75.0",
    "@theia/workspace": "1.75.0"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "^20.0.0",
    "mocha": "^10.0.0",
    "rimraf": "^5.0.0",
    "typescript": "~5.4.5"
  },
  "scripts": {
    "clean": "rimraf lib",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "tsc && mocha \"lib/common/**/*.spec.js\" \"lib/node/**/*.spec.js\" \"lib/browser/changes-tree.spec.js\""
  },
  "theiaExtensions": [
    {
      "frontend": "lib/browser/changes-frontend-module",
      "backend": "lib/node/changes-backend-module"
    }
  ]
}
```

In this task the `theiaExtensions` entry has only the `backend` line, because the front-end module does not exist yet. Write it as:
```json
  "theiaExtensions": [
    {
      "backend": "lib/node/changes-backend-module"
    }
  ]
```
and write the `test` script without the third pattern: `"tsc && mocha \"lib/common/**/*.spec.js\" \"lib/node/**/*.spec.js\""`. Task 5 adds the `frontend` line and the third pattern.

`extensions/changes-view/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib",
    "types": ["node", "mocha"]
  },
  "include": ["src"]
}
```

Run: `npm install`
Expected: no error.

- [ ] **Step 2: Create the protocol file**

`extensions/changes-view/src/common/changes-protocol.ts`:
```ts
export const CHANGES_SERVICE_PATH = "/services/ai1-changes";

export const ChangesService = Symbol("ChangesService");

export interface FileChangeEntry {
  // The two status characters of `git status --porcelain`, for example " M", "??", "R ".
  status: string;
  // The path in the working tree, relative to the repository root.
  path: string;
  // For a rename or a copy: the path at HEAD.
  sourcePath?: string;
}

export interface RepoChanges {
  name: string;
  // The `file:` URI of the repository root.
  rootUri: string;
  branch: string;
  files: FileChangeEntry[];
}

export interface ChangesService {
  // Returns the repositories that have uncommitted changes, sorted by name.
  scan(workspaceRootUris: string[]): Promise<RepoChanges[]>;
  // Returns the content of a file at HEAD. Returns an empty string when HEAD does not have the file.
  readHead(repoRootUri: string, path: string): Promise<string>;
  discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void>;
  discardAll(repoRootUri: string): Promise<void>;
}
```

- [ ] **Step 3: Write the failing tests of the pure logic**

`extensions/changes-view/src/common/git-status.spec.ts`:
```ts
import * as assert from "node:assert";
import {
  discardAllPrompt,
  discardPlan,
  discardPrompt,
  isUntracked,
  parseStatusOutput,
  statusBadge,
} from "./git-status";

describe("parseStatusOutput", () => {
  it("parses a modified file", () => {
    assert.deepStrictEqual(parseStatusOutput(" M src/index.ts\n"), [{ status: " M", path: "src/index.ts" }]);
  });

  it("parses a rename into the new path and the source path", () => {
    assert.deepStrictEqual(parseStatusOutput("R  old/a.ts -> new/b.ts\n"), [
      { status: "R ", path: "new/b.ts", sourcePath: "old/a.ts" },
    ]);
  });

  it("parses many lines and skips empty ones", () => {
    const entries = parseStatusOutput("?? notes.md\n M a.ts\n\n");
    assert.deepStrictEqual(
      entries.map((entry) => entry.path),
      ["notes.md", "a.ts"],
    );
  });

  it("returns no entries for empty output", () => {
    assert.deepStrictEqual(parseStatusOutput(""), []);
  });
});

describe("statusBadge", () => {
  it("shows U for an untracked file", () => {
    assert.strictEqual(statusBadge("??"), "U");
  });

  it("shows the index letter when the index has a change", () => {
    assert.strictEqual(statusBadge("A "), "A");
    assert.strictEqual(statusBadge("R "), "R");
  });

  it("shows the working tree letter when only the working tree has a change", () => {
    assert.strictEqual(statusBadge(" M"), "M");
    assert.strictEqual(statusBadge(" D"), "D");
  });
});

describe("isUntracked", () => {
  it("is true for the ?? status only", () => {
    assert.strictEqual(isUntracked({ status: "??", path: "a" }), true);
    assert.strictEqual(isUntracked({ status: " M", path: "a" }), false);
  });
});

describe("discardPlan", () => {
  it("deletes an untracked file", () => {
    assert.deepStrictEqual(discardPlan({ status: "??", path: "new.ts" }), { kind: "delete", path: "new.ts" });
  });

  it("restores the two paths of a rename", () => {
    assert.deepStrictEqual(discardPlan({ status: "R ", path: "b.ts", sourcePath: "a.ts" }), {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", "a.ts", "b.ts"],
    });
  });

  it("checks out HEAD for other tracked files", () => {
    assert.deepStrictEqual(discardPlan({ status: " M", path: "a.ts" }), {
      kind: "git",
      args: ["checkout", "HEAD", "--", "a.ts"],
    });
  });
});

describe("discardPrompt", () => {
  it("asks to delete an untracked file", () => {
    const prompt = discardPrompt({ status: "??", path: "src/new.ts" });
    assert.strictEqual(prompt.ok, "Delete file");
    assert.ok(prompt.msg.includes("new.ts"));
  });

  it("asks to undo a rename and names the two paths", () => {
    const prompt = discardPrompt({ status: "R ", path: "b.ts", sourcePath: "a.ts" });
    assert.strictEqual(prompt.ok, "Undo rename");
    assert.ok(prompt.msg.includes("a.ts") && prompt.msg.includes("b.ts"));
  });

  it("asks to discard the changes of a tracked file", () => {
    assert.strictEqual(discardPrompt({ status: " M", path: "a.ts" }).ok, "Discard changes");
  });
});

describe("discardAllPrompt", () => {
  it("names the repository and the number of changes", () => {
    const prompt = discardAllPrompt("payments-api", 3);
    assert.ok(prompt.msg.includes("payments-api") && prompt.msg.includes("3 changes"));
  });

  it("uses the singular for one change", () => {
    assert.ok(discardAllPrompt("payments-api", 1).msg.includes("1 change "));
  });
});
```

`extensions/changes-view/src/common/refresh-filter.spec.ts`:
```ts
import * as assert from "node:assert";
import { shouldIgnorePath } from "./refresh-filter";

describe("shouldIgnorePath", () => {
  it("ignores paths inside folders that change all the time", () => {
    for (const folder of [".git", "node_modules", "dist", "out", "build", "coverage"]) {
      assert.strictEqual(shouldIgnorePath(`/work/repo/${folder}/file.js`), true, folder);
    }
  });

  it("ignores build state files, logs, and editor swap files", () => {
    for (const name of ["tsconfig.tsbuildinfo", "debug.log", ".index.ts.swp", ".index.ts.swo"]) {
      assert.strictEqual(shouldIgnorePath(`/work/repo/src/${name}`), true, name);
    }
  });

  it("ignores operating system files", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/.DS_Store"), true);
    assert.strictEqual(shouldIgnorePath("/work/repo/src/Thumbs.db"), true);
  });

  it("does not ignore a source file", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/index.ts"), false);
  });

  it("does not ignore a file whose name only contains an ignored folder name", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/distance.ts"), false);
  });
});
```

Run: `npm test --workspace extensions/changes-view`
Expected: FAIL. `tsc` reports `Cannot find module './git-status'` and `'./refresh-filter'`.

- [ ] **Step 4: Write the pure logic**

`extensions/changes-view/src/common/git-status.ts`:
```ts
import { FileChangeEntry } from "./changes-protocol";

// Parses one line of `git status --porcelain`. Porcelain version 1 reports a
// rename as "R  old -> new".
function parseStatusLine(line: string): FileChangeEntry {
  const status = line.slice(0, 2);
  const filePart = line.slice(3);
  const arrow = filePart.indexOf(" -> ");
  if (arrow >= 0) {
    return { status, path: filePart.slice(arrow + 4), sourcePath: filePart.slice(0, arrow) };
  }
  return { status, path: filePart };
}

export function parseStatusOutput(stdout: string): FileChangeEntry[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 3)
    .map(parseStatusLine);
}

// The one letter that a file row shows.
export function statusBadge(status: string): string {
  if (status === "??") {
    return "U";
  }
  const index = status.charAt(0);
  const workingTree = status.charAt(1);
  return index === " " ? workingTree || "?" : index || "?";
}

export function isUntracked(entry: FileChangeEntry): boolean {
  return entry.status === "??";
}

export type DiscardPlan = { kind: "delete"; path: string } | { kind: "git"; args: string[] };

// Selects how to discard the changes of one file.
//   - An untracked file has no HEAD version, so it is deleted.
//   - A rename restores the old path and removes the new path in one command.
//     `git checkout HEAD -- <new>` fails, because HEAD does not have the new path.
//   - Other tracked files reset the index and the working tree to HEAD.
export function discardPlan(entry: FileChangeEntry): DiscardPlan {
  if (isUntracked(entry)) {
    return { kind: "delete", path: entry.path };
  }
  if (entry.sourcePath) {
    return {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", entry.sourcePath, entry.path],
    };
  }
  return { kind: "git", args: ["checkout", "HEAD", "--", entry.path] };
}

export interface DiscardPrompt {
  title: string;
  msg: string;
  ok: string;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function discardPrompt(entry: FileChangeEntry): DiscardPrompt {
  if (isUntracked(entry)) {
    return {
      title: "Delete file",
      msg: `Delete '${baseName(entry.path)}'? You cannot undo this.`,
      ok: "Delete file",
    };
  }
  if (entry.sourcePath) {
    return {
      title: "Undo rename",
      msg: `Undo the rename ${entry.sourcePath} → ${entry.path}? The new file is removed and the original is restored. You cannot undo this.`,
      ok: "Undo rename",
    };
  }
  return {
    title: "Discard changes",
    msg: `Discard the changes in '${baseName(entry.path)}'? You cannot undo this.`,
    ok: "Discard changes",
  };
}

export function discardAllPrompt(repoName: string, changeCount: number): DiscardPrompt {
  const changes = `${changeCount} change${changeCount === 1 ? "" : "s"}`;
  return {
    title: "Discard all changes",
    msg: `Discard all changes in '${repoName}'? ${changes} will be discarded: modified files are reset and untracked files are deleted. Ignored paths stay. You cannot undo this.`,
    ok: "Discard all changes",
  };
}
```

The second `discardAllPrompt` test looks for `"1 change "` with a space after it. The sentence above gives `1 change will be discarded`, so the test passes.

`extensions/changes-view/src/common/refresh-filter.ts`:
```ts
const IGNORED_FOLDERS = ["/.git/", "/node_modules/", "/dist/", "/out/", "/build/", "/coverage/"];
const IGNORED_EXTENSIONS = [".tsbuildinfo", ".log", ".swp", ".swo"];
const IGNORED_NAMES = ["/.DS_Store", "/Thumbs.db"];

// Returns true for a path that changes often and does not change the output of
// `git status`: git internals, installed dependencies, build outputs, logs,
// editor swap files, and operating system files. A change of such a path must
// not start a refresh of the Changes view.
export function shouldIgnorePath(fsPath: string): boolean {
  return (
    IGNORED_FOLDERS.some((folder) => fsPath.includes(folder)) ||
    IGNORED_EXTENSIONS.some((extension) => fsPath.endsWith(extension)) ||
    IGNORED_NAMES.some((name) => fsPath.endsWith(name))
  );
}
```

Run: `npm test --workspace extensions/changes-view`
Expected: PASS, `21 passing`.

- [ ] **Step 5: Write the failing test of the service**

This test uses real git repositories in a temporary folder. It tests behavior, with no mocks.

`extensions/changes-view/src/node/changes-service-impl.spec.ts`:
```ts
import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { ChangesServiceImpl } from "./changes-service-impl";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=AI1 Test", "-c", "user.email=test@ai1.invalid", ...args], { cwd });
}

function createRepo(root: string, name: string): string {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "index.ts"), "export const value = 1;\n");
  fs.writeFileSync(path.join(repo, "old-name.ts"), "export const renamed = true;\n");
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "Initial commit");
  return repo;
}

const uriOf = (fsPath: string): string => pathToFileURL(fsPath).toString();

describe("ChangesServiceImpl", () => {
  const service = new ChangesServiceImpl();
  let root: string;
  let dirty: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-")));
    createRepo(root, "clean-repo");
    dirty = createRepo(root, "dirty-repo");
    fs.writeFileSync(path.join(dirty, "index.ts"), "export const value = 2;\n");
    fs.writeFileSync(path.join(dirty, "untracked.ts"), "export {};\n");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns only the repositories that have changes", async () => {
    const repos = await service.scan([uriOf(root)]);
    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["dirty-repo"],
    );
  });

  it("returns the branch and the changed files of a repository", async () => {
    const [repo] = await service.scan([uriOf(root)]);
    assert.strictEqual(repo.branch, "main");
    assert.deepStrictEqual(
      repo.files.map((file) => [file.status, file.path]),
      [
        [" M", "index.ts"],
        ["??", "untracked.ts"],
      ],
    );
  });

  it("treats a workspace root that is a repository as one repository", async () => {
    const repos = await service.scan([uriOf(dirty)]);
    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["dirty-repo"],
    );
  });

  it("reads the content of a file at HEAD", async () => {
    assert.strictEqual(await service.readHead(uriOf(dirty), "index.ts"), "export const value = 1;\n");
  });

  it("returns an empty string for a file that HEAD does not have", async () => {
    assert.strictEqual(await service.readHead(uriOf(dirty), "untracked.ts"), "");
  });

  it("restores a modified file", async () => {
    await service.discardFile(uriOf(dirty), { status: " M", path: "index.ts" });
    assert.strictEqual(fs.readFileSync(path.join(dirty, "index.ts"), "utf8"), "export const value = 1;\n");
  });

  it("deletes an untracked file", async () => {
    await service.discardFile(uriOf(dirty), { status: "??", path: "untracked.ts" });
    assert.strictEqual(fs.existsSync(path.join(dirty, "untracked.ts")), false);
  });

  it("undoes a staged rename", async () => {
    git(dirty, "mv", "old-name.ts", "new-name.ts");
    const [repo] = await service.scan([uriOf(root)]);
    const rename = repo.files.find((file) => file.sourcePath === "old-name.ts");
    assert.ok(rename, "the scan reports the rename");
    await service.discardFile(uriOf(dirty), rename);
    assert.strictEqual(fs.existsSync(path.join(dirty, "old-name.ts")), true);
    assert.strictEqual(fs.existsSync(path.join(dirty, "new-name.ts")), false);
  });

  it("discards all changes of a repository and keeps ignored paths", async () => {
    fs.writeFileSync(path.join(dirty, ".gitignore"), "kept/\n");
    git(dirty, "add", ".gitignore");
    git(dirty, "commit", "--quiet", "-m", "Ignore the kept folder");
    fs.mkdirSync(path.join(dirty, "kept"));
    fs.writeFileSync(path.join(dirty, "kept", "cache.txt"), "stays\n");

    await service.discardAll(uriOf(dirty));

    assert.deepStrictEqual(await service.scan([uriOf(root)]), []);
    assert.strictEqual(fs.existsSync(path.join(dirty, "kept", "cache.txt")), true);
  });

  it("rejects with the git error text when a discard fails", async () => {
    await assert.rejects(service.discardFile(uriOf(dirty), { status: " M", path: "does-not-exist.ts" }), /does-not-exist/);
  });
});
```

Run: `npm test --workspace extensions/changes-view`
Expected: FAIL. `tsc` reports `Cannot find module './changes-service-impl'`.

- [ ] **Step 6: Write the git runner and the service**

`extensions/changes-view/src/node/git-runner.ts`:
```ts
import { execFile } from "node:child_process";

const MAX_BUFFER = 50 * 1024 * 1024;

// Runs a read-only git command. A failure gives an empty string: a folder that
// is not a repository, or a path that HEAD does not have, is a normal case.
export function readGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-C", repoPath, ...args], { encoding: "utf8", maxBuffer: MAX_BUFFER }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  });
}

// Runs a git command that changes the repository. A failure rejects with the
// text that git wrote, so that the user sees the real cause.
export function runGit(repoPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", repoPath, ...args], { encoding: "utf8" }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve();
      }
    });
  });
}
```

`extensions/changes-view/src/node/changes-service-impl.ts`:
```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesService, FileChangeEntry, RepoChanges } from "../common/changes-protocol";
import { discardPlan, parseStatusOutput } from "../common/git-status";
import { readGit, runGit } from "./git-runner";

interface RepoCandidate {
  name: string;
  path: string;
}

@injectable()
export class ChangesServiceImpl implements ChangesService {
  async scan(workspaceRootUris: string[]): Promise<RepoChanges[]> {
    const candidates = (await Promise.all(workspaceRootUris.map((uri) => this.findRepos(fileURLToPath(uri))))).flat();
    // All repositories in parallel: the total time is the time of the slowest one.
    const scanned = await Promise.all(candidates.map((candidate) => this.scanRepo(candidate)));
    return scanned
      .filter((repo): repo is RepoChanges => repo !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async readHead(repoRootUri: string, filePath: string): Promise<string> {
    return readGit(fileURLToPath(repoRootUri), ["show", `HEAD:${filePath}`]);
  }

  async discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void> {
    const repoPath = fileURLToPath(repoRootUri);
    const plan = discardPlan(entry);
    if (plan.kind === "delete") {
      await fs.promises.unlink(path.join(repoPath, plan.path));
    } else {
      await runGit(repoPath, plan.args);
    }
  }

  async discardAll(repoRootUri: string): Promise<void> {
    const repoPath = fileURLToPath(repoRootUri);
    await runGit(repoPath, ["reset", "--hard", "HEAD"]);
    // No `-x`: ignored paths such as node_modules stay. The removed set is then
    // the set of `??` rows, because the scan uses --untracked-files=all.
    await runGit(repoPath, ["clean", "-fd"]);
  }

  // A workspace root is one repository, or a folder whose direct children are repositories.
  protected async findRepos(root: string): Promise<RepoCandidate[]> {
    if (fs.existsSync(path.join(root, ".git"))) {
      return [{ name: path.basename(root), path: root }];
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, ".git")))
      .map((entry) => ({ name: entry.name, path: path.join(root, entry.name) }));
  }

  protected async scanRepo(candidate: RepoCandidate): Promise<RepoChanges | undefined> {
    // --untracked-files=all lists each untracked file, not only its folder.
    const files = parseStatusOutput(
      await readGit(candidate.path, ["status", "--porcelain", "--untracked-files=all"]),
    );
    if (files.length === 0) {
      return undefined;
    }
    const branch = (await readGit(candidate.path, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return { name: candidate.name, rootUri: pathToFileURL(candidate.path).toString(), branch, files };
  }
}
```

Run: `npm test --workspace extensions/changes-view`
Expected: PASS, `31 passing`. The test output has no warnings.

If the test "rejects with the git error text" fails because git checks out nothing and exits with 0 on this git version, read the real behavior with `git -C <repo> checkout HEAD -- does-not-exist.ts; echo $?` and report it. Do not weaken the test without that evidence.

- [ ] **Step 7: Write the back-end module and add the extension to the application**

`extensions/changes-view/src/node/changes-backend-module.ts`:
```ts
import { ConnectionHandler, RpcConnectionHandler } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { CHANGES_SERVICE_PATH, ChangesService } from "../common/changes-protocol";
import { ChangesServiceImpl } from "./changes-service-impl";

export default new ContainerModule((bind) => {
  bind(ChangesService).to(ChangesServiceImpl).inSingletonScope();
  bind(ConnectionHandler)
    .toDynamicValue((context) => new RpcConnectionHandler(CHANGES_SERVICE_PATH, () => context.container.get(ChangesService)))
    .inSingletonScope();
});
```

In `applications/electron/package.json`, add to `dependencies`: `"ai1-changes-view": "0.1.0"`

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm install
npm run build
```
Expected: no error. Start the app for 60 seconds in the background and check that the log has no error that names `ai1-changes` or `ChangesService`. Stop the app.

- [ ] **Step 8: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors.

```bash
git add extensions/changes-view applications/electron/package.json package-lock.json
git commit -m "Add the back end of the Changes view" -m "A Node service finds the git repositories under a workspace root, reads their status in parallel, reads a file at HEAD, and discards changes. The parser, the status letter, the discard selection, and the refresh filter are pure functions with unit tests. The service tests run against real repositories."
```

---

### Task 5: The `changes-view` front end

**Files:**
- Create: `extensions/changes-view/src/common/head-uri.ts`, test `head-uri.spec.ts`
- Create: `extensions/changes-view/src/browser/changes-tree.ts`, test `changes-tree.spec.ts`
- Create: `extensions/changes-view/src/browser/head-resource-resolver.ts`
- Create: `extensions/changes-view/src/browser/changes-widget.tsx`
- Create: `extensions/changes-view/src/browser/changes-contribution.ts`
- Create: `extensions/changes-view/src/browser/changes-frontend-module.ts`
- Create: `extensions/changes-view/src/browser/style/changes.css`
- Modify: `extensions/changes-view/package.json` (the `frontend` line and the `test` script, see Task 4 Step 1)

**Interfaces:**
- Consumes: every name in the "Produces" list of Task 4. `LabelProvider.getIcon(uri)` (the Material icon class when Task 3 is active).
- Produces:
  - Widget id `ai1-changes` (DOM id of the widget), label `Changes`, opened in the `right` area on the first start. Task 6 and Task 8 rely on this id and area.
  - Commands `ai1.changes.refresh`, `ai1.changes.expandAll`, `ai1.changes.collapseAll`.
  - CSS classes that Task 8 uses: `ai1-changes-repo`, `ai1-changes-file`, `ai1-changes-badge`.

- [ ] **Step 1: Write the failing tests of the two pure modules**

`extensions/changes-view/src/common/head-uri.spec.ts`:
```ts
import * as assert from "node:assert";
import { decodeHeadUri, encodeHeadUri, HEAD_SCHEME } from "./head-uri";

describe("head URI", () => {
  it("round-trips the repository and the path", () => {
    const uri = encodeHeadUri("file:///work/payments-api", "src/routes/index.ts");
    assert.deepStrictEqual(decodeHeadUri(uri), {
      repoRootUri: "file:///work/payments-api",
      path: "src/routes/index.ts",
    });
  });

  it("uses its own scheme and keeps the file name, so that the editor selects the language", () => {
    const uri = encodeHeadUri("file:///work/payments-api", "src/routes/index.ts");
    assert.strictEqual(uri.scheme, HEAD_SCHEME);
    assert.strictEqual(uri.path.base, "index.ts");
  });

  it("round-trips a path with spaces and special characters", () => {
    const uri = encodeHeadUri("file:///work/my%20repo", "docs/a b&c?.md");
    assert.strictEqual(decodeHeadUri(uri).path, "docs/a b&c?.md");
  });
});
```

`extensions/changes-view/src/browser/changes-tree.spec.ts`:
```ts
import * as assert from "node:assert";
import { RepoChanges } from "../common/changes-protocol";
import { buildRoot, FileNode, RepoNode } from "./changes-tree";

const repos: RepoChanges[] = [
  {
    name: "payments-api",
    rootUri: "file:///work/payments-api",
    branch: "feat/refunds",
    files: [
      { status: " M", path: "src/handler.ts" },
      { status: "??", path: "notes.md" },
    ],
  },
];

describe("buildRoot", () => {
  it("makes one repository node with one file node for each file", () => {
    const root = buildRoot(repos, () => undefined);
    const repo = root.children[0] as RepoNode;
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(repo.kind, "repo");
    assert.deepStrictEqual(
      repo.children.map((child) => (child as FileNode).entry.path),
      ["src/handler.ts", "notes.md"],
    );
  });

  it("gives stable ids, so that the tree keeps its state across a refresh", () => {
    const repo = buildRoot(repos, () => undefined).children[0] as RepoNode;
    assert.strictEqual(repo.id, "repo:file:///work/payments-api");
    assert.strictEqual(repo.children[0].id, "file:file:///work/payments-api:src/handler.ts");
  });

  it("expands a repository that is new", () => {
    const repo = buildRoot(repos, () => undefined).children[0] as RepoNode;
    assert.strictEqual(repo.expanded, true);
  });

  it("keeps a repository collapsed when the user collapsed it", () => {
    const repo = buildRoot(repos, (id) => (id === "repo:file:///work/payments-api" ? false : undefined))
      .children[0] as RepoNode;
    assert.strictEqual(repo.expanded, false);
  });

  it("links each node to its parent", () => {
    const root = buildRoot(repos, () => undefined);
    const repo = root.children[0] as RepoNode;
    assert.strictEqual(repo.parent, root);
    assert.strictEqual(repo.children[0].parent, repo);
  });

  it("gives a root with no children when nothing changed", () => {
    assert.strictEqual(buildRoot([], () => undefined).children.length, 0);
  });
});
```

Change the `test` script and the `theiaExtensions` entry in `extensions/changes-view/package.json` to the full forms that Task 4 Step 1 shows.

Run: `npm test --workspace extensions/changes-view`
Expected: FAIL. `tsc` reports `Cannot find module './head-uri'` and `'./changes-tree'`.

- [ ] **Step 2: Write the two pure modules**

`extensions/changes-view/src/common/head-uri.ts`:
```ts
import URI from "@theia/core/lib/common/uri";

export const HEAD_SCHEME = "ai1-head";

export interface HeadLocation {
  repoRootUri: string;
  path: string;
}

// The URI of a file at HEAD. The path part keeps the file name, so that the
// editor selects the language. The query holds the exact values.
export function encodeHeadUri(repoRootUri: string, path: string): URI {
  return new URI()
    .withScheme(HEAD_SCHEME)
    .withPath(`/${path}`)
    .withQuery(JSON.stringify([repoRootUri, path]));
}

export function decodeHeadUri(uri: URI): HeadLocation {
  const [repoRootUri, path] = JSON.parse(uri.query) as [string, string];
  return { repoRootUri, path };
}
```

`extensions/changes-view/src/browser/changes-tree.ts`:
```ts
import type { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode } from "@theia/core/lib/browser/tree";
import { FileChangeEntry, RepoChanges } from "../common/changes-protocol";

export const CHANGES_ROOT_ID = "ai1-changes-root";

export interface RepoNode extends CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode {
  kind: "repo";
  repo: RepoChanges;
}

export interface FileNode extends SelectableTreeNode {
  kind: "file";
  repoRootUri: string;
  entry: FileChangeEntry;
}

export function isRepoNode(node: unknown): node is RepoNode {
  return typeof node === "object" && node !== null && (node as RepoNode).kind === "repo";
}

export function isFileNode(node: unknown): node is FileNode {
  return typeof node === "object" && node !== null && (node as FileNode).kind === "file";
}

// Builds the tree from the scan result. `wasExpanded` gives the state of a
// repository node in the tree that this one replaces: true, false, or
// undefined for a repository that is new. A new repository is expanded.
export function buildRoot(
  repos: RepoChanges[],
  wasExpanded: (nodeId: string) => boolean | undefined,
): CompositeTreeNode {
  const root: CompositeTreeNode = { id: CHANGES_ROOT_ID, parent: undefined, visible: false, children: [] };
  const repoNodes = repos.map((repo) => {
    const id = `repo:${repo.rootUri}`;
    const node: RepoNode = {
      id,
      kind: "repo",
      repo,
      parent: root,
      children: [],
      expanded: wasExpanded(id) ?? true,
      selected: false,
    };
    node.children = repo.files.map(
      (entry): FileNode => ({
        id: `file:${repo.rootUri}:${entry.path}`,
        kind: "file",
        repoRootUri: repo.rootUri,
        entry,
        parent: node,
        selected: false,
      }),
    );
    return node;
  });
  (root as { children: CompositeTreeNode["children"] }).children = repoNodes;
  return root;
}
```

Run: `npm test --workspace extensions/changes-view`
Expected: PASS, `40 passing`.

If `tsc` reports that `children` of `CompositeTreeNode` is read-only in a different way, or that a node needs more fields, read `node_modules/@theia/core/src/browser/tree/tree.ts` (`TreeNode`, `CompositeTreeNode`), `tree-expansion.ts` (`ExpandableTreeNode`), and `tree-selection.ts` (`SelectableTreeNode`), and add exactly the missing fields.

- [ ] **Step 3: Write the resource resolver**

`extensions/changes-view/src/browser/head-resource-resolver.ts`:
```ts
import { Resource, ResourceResolver } from "@theia/core/lib/common/resource";
import URI from "@theia/core/lib/common/uri";
import { inject, injectable } from "@theia/core/shared/inversify";
import { ChangesService } from "../common/changes-protocol";
import { decodeHeadUri, HEAD_SCHEME } from "../common/head-uri";

// Gives the diff editor the content of a file at HEAD.
@injectable()
export class HeadResourceResolver implements ResourceResolver {
  @inject(ChangesService)
  protected readonly changes!: ChangesService;

  resolve(uri: URI): Resource {
    if (uri.scheme !== HEAD_SCHEME) {
      throw new Error(`The scheme '${uri.scheme}' is not '${HEAD_SCHEME}'.`);
    }
    const { repoRootUri, path } = decodeHeadUri(uri);
    return {
      uri,
      readContents: () => this.changes.readHead(repoRootUri, path),
      dispose: () => undefined,
    };
  }
}
```

- [ ] **Step 4: Write the widget**

`extensions/changes-view/src/browser/changes-widget.tsx`:
```tsx
import { MessageService } from "@theia/core";
import {
  codicon,
  CompositeTreeNode,
  ConfirmDialog,
  ContextMenuRenderer,
  ExpandableTreeNode,
  NodeProps,
  open,
  OpenerService,
  TreeModel,
  TreeNode,
  TreeProps,
  TreeWidget,
} from "@theia/core/lib/browser";
import { DiffUris } from "@theia/core/lib/browser/diff-uris";
import URI from "@theia/core/lib/common/uri";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { Message } from "@theia/core/shared/@lumino/messaging";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import { ChangesService, RepoChanges } from "../common/changes-protocol";
import { discardAllPrompt, discardPrompt, DiscardPrompt, isUntracked, statusBadge } from "../common/git-status";
import { encodeHeadUri } from "../common/head-uri";
import { shouldIgnorePath } from "../common/refresh-filter";
import { buildRoot, FileNode, isFileNode, isRepoNode, RepoNode } from "./changes-tree";

const REFRESH_DEBOUNCE_MS = 500;

@injectable()
export class ChangesWidget extends TreeWidget {
  static readonly ID = "ai1-changes";
  static readonly LABEL = "Changes";

  @inject(ChangesService)
  protected readonly changes!: ChangesService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(FileService)
  protected readonly files!: FileService;

  @inject(OpenerService)
  protected readonly openerService!: OpenerService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  protected refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    @inject(TreeProps) props: TreeProps,
    @inject(TreeModel) model: TreeModel,
    @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
  ) {
    super(props, model, contextMenuRenderer);
  }

  @postConstruct()
  protected override init(): void {
    super.init();
    this.id = ChangesWidget.ID;
    this.title.label = ChangesWidget.LABEL;
    this.title.caption = ChangesWidget.LABEL;
    this.title.iconClass = codicon("git-compare");
    this.title.closable = true;
    this.addClass("ai1-changes");

    this.toDispose.push(
      this.files.onDidFilesChange((event) => {
        if (event.changes.some((change) => !shouldIgnorePath(change.resource.path.toString()))) {
          this.scheduleRefresh();
        }
      }),
    );
    this.toDispose.push(this.workspace.onWorkspaceChanged(() => this.scheduleRefresh(0)));
    this.scheduleRefresh(0);
  }

  // One timer serves all refresh sources, so that a burst of file events gives one scan.
  scheduleRefresh(delay: number = REFRESH_DEBOUNCE_MS): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), delay);
  }

  async refresh(): Promise<void> {
    let repos: RepoChanges[];
    try {
      const roots = await this.workspace.roots;
      repos = await this.changes.scan(roots.map((root) => root.resource.toString()));
    } catch (error) {
      console.error("ai1-changes: the scan failed", error);
      return;
    }
    this.model.root = buildRoot(repos, (nodeId) => {
      const previous = this.model.getNode(nodeId);
      return ExpandableTreeNode.is(previous) ? previous.expanded : undefined;
    });
  }

  expandAll(): void {
    const root = this.model.root;
    if (CompositeTreeNode.is(root)) {
      for (const child of root.children) {
        if (ExpandableTreeNode.is(child)) {
          this.model.expandNode(child);
        }
      }
    }
  }

  collapseAll(): void {
    const root = this.model.root;
    if (CompositeTreeNode.is(root)) {
      this.model.collapseAll(root);
    }
  }

  protected override onAfterShow(message: Message): void {
    super.onAfterShow(message);
    this.scheduleRefresh(0);
  }

  protected override renderTree(model: TreeModel): React.ReactNode {
    const root = model.root;
    if (!CompositeTreeNode.is(root) || root.children.length === 0) {
      return <div className="theia-widget-noInfo">No changes to show. Edited files show here when you save them.</div>;
    }
    return super.renderTree(model);
  }

  protected override renderIcon(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return <div className={`${codicon("repo")} ai1-changes-repo-icon`}></div>;
    }
    if (isFileNode(node)) {
      return <div className={`${this.labelProvider.getIcon(this.fileUri(node))} file-icon`}></div>;
    }
    return null;
  }

  protected override renderCaption(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return (
        <div className="ai1-changes-caption ai1-changes-repo" title={new URI(node.repo.rootUri).path.fsPath()}>
          <span className="ai1-changes-name">{node.repo.name}</span>
          <span className="ai1-changes-description">{node.repo.branch || "(detached)"}</span>
        </div>
      );
    }
    if (isFileNode(node)) {
      const path = node.entry.path;
      const slash = path.lastIndexOf("/");
      const title = node.entry.sourcePath ? `${path}\nrenamed from ${node.entry.sourcePath}` : path;
      return (
        <div className="ai1-changes-caption ai1-changes-file" title={title}>
          <span className="ai1-changes-name">{path.slice(slash + 1)}</span>
          <span className="ai1-changes-description">{slash >= 0 ? path.slice(0, slash) : ""}</span>
        </div>
      );
    }
    return null;
  }

  protected override renderTailDecorations(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return (
        <div className="ai1-changes-tail">
          {this.renderAction("discard", "Discard All Changes", () => this.discardAll(node))}
          <span className="ai1-changes-badge">{node.repo.files.length}</span>
        </div>
      );
    }
    if (isFileNode(node)) {
      const badge = statusBadge(node.entry.status);
      return (
        <div className="ai1-changes-tail">
          {this.renderAction("go-to-file", "Open File", () => this.openFile(node))}
          {this.renderAction("discard", "Discard Changes", () => this.discardFile(node))}
          <span className={`ai1-changes-badge ai1-changes-badge-${badge}`}>{badge}</span>
        </div>
      );
    }
    return null;
  }

  protected renderAction(icon: string, title: string, run: () => void): React.ReactNode {
    const onClick = (event: React.MouseEvent): void => {
      event.stopPropagation();
      run();
    };
    return <span className={`${codicon(icon)} ai1-changes-action`} title={title} onClick={onClick}></span>;
  }

  // The base class opens a node on a double click. A file row opens its diff on a single click.
  protected override tapNode(node?: TreeNode): void {
    super.tapNode(node);
    if (isFileNode(node)) {
      this.openDiff(node);
    }
  }

  protected fileUri(node: FileNode): URI {
    return new URI(node.repoRootUri).resolve(node.entry.path);
  }

  protected openFile(node: FileNode): void {
    open(this.openerService, this.fileUri(node)).catch((error) => this.messages.error(String(error)));
  }

  protected openDiff(node: FileNode): void {
    const working = this.fileUri(node);
    // An untracked file has no HEAD version to compare with.
    if (isUntracked(node.entry)) {
      this.openFile(node);
      return;
    }
    // HEAD has a renamed file under its old path.
    const head = encodeHeadUri(node.repoRootUri, node.entry.sourcePath ?? node.entry.path);
    const label = `${working.path.base} (HEAD ↔ Working)`;
    open(this.openerService, DiffUris.encode(head, working, label)).catch((error) => this.messages.error(String(error)));
  }

  protected async discardFile(node: FileNode): Promise<void> {
    await this.confirmAndRun(discardPrompt(node.entry), () => this.changes.discardFile(node.repoRootUri, node.entry));
  }

  protected async discardAll(node: RepoNode): Promise<void> {
    await this.confirmAndRun(discardAllPrompt(node.repo.name, node.repo.files.length), () =>
      this.changes.discardAll(node.repo.rootUri),
    );
  }

  protected async confirmAndRun(prompt: DiscardPrompt, run: () => Promise<void>): Promise<void> {
    const confirmed = await new ConfirmDialog({ title: prompt.title, msg: prompt.msg, ok: prompt.ok }).open();
    if (!confirmed) {
      return;
    }
    try {
      await run();
    } catch (error) {
      this.messages.error(`${prompt.title} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.refresh();
  }
}
```

Compile check points, with the file to read if `tsc` reports an error:
- The `init` override and its `@postConstruct()` mark, `renderTree`, `renderIcon`, `renderCaption`, `renderTailDecorations`, `tapNode`, `NodeProps`: `node_modules/@theia/core/src/browser/tree/tree-widget.tsx`, and the pattern `node_modules/@theia/outline-view/src/browser/outline-view-widget.tsx`.
- The Lumino `Message` import path: copy it from `outline-view-widget.tsx`.
- `URI.path.fsPath()`: `node_modules/@theia/core/src/common/path.ts`. If it does not exist, use `new URI(...).path.toString()`.

- [ ] **Step 5: Write the contribution**

`extensions/changes-view/src/browser/changes-contribution.ts`:
```ts
import { Command, CommandRegistry } from "@theia/core";
import { AbstractViewContribution, codicon, FrontendApplicationContribution, Widget } from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesWidget } from "./changes-widget";

export const ChangesCommands = {
  REFRESH: { id: "ai1.changes.refresh", label: "Changes: Refresh", iconClass: codicon("refresh") },
  EXPAND_ALL: { id: "ai1.changes.expandAll", label: "Changes: Expand All", iconClass: codicon("expand-all") },
  COLLAPSE_ALL: { id: "ai1.changes.collapseAll", label: "Changes: Collapse All", iconClass: codicon("collapse-all") },
} satisfies Record<string, Command>;

@injectable()
export class ChangesContribution
  extends AbstractViewContribution<ChangesWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  constructor() {
    super({
      widgetId: ChangesWidget.ID,
      widgetName: ChangesWidget.LABEL,
      defaultWidgetOptions: { area: "right", rank: 100 },
      toggleCommandId: "ai1.changes.toggle",
    });
  }

  // Theia calls this only when no saved layout exists. So the view opens on
  // the right on the first start, and later manual changes stay.
  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: true });
  }

  override registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    const forChanges = (run: (widget: ChangesWidget) => void) => ({
      execute: (widget?: Widget) => this.withChangesWidget(widget, run),
      isEnabled: (widget?: Widget) => widget instanceof ChangesWidget,
      isVisible: (widget?: Widget) => widget instanceof ChangesWidget,
    });
    commands.registerCommand(ChangesCommands.REFRESH, forChanges((widget) => widget.scheduleRefresh(0)));
    commands.registerCommand(ChangesCommands.EXPAND_ALL, forChanges((widget) => widget.expandAll()));
    commands.registerCommand(ChangesCommands.COLLAPSE_ALL, forChanges((widget) => widget.collapseAll()));
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    const items: [Command, string, number][] = [
      [ChangesCommands.REFRESH, "Refresh", 0],
      [ChangesCommands.EXPAND_ALL, "Expand All", 1],
      [ChangesCommands.COLLAPSE_ALL, "Collapse All", 2],
    ];
    for (const [command, tooltip, priority] of items) {
      toolbar.registerItem({ id: command.id, command: command.id, tooltip, priority });
    }
  }

  protected withChangesWidget(widget: Widget | undefined, run: (widget: ChangesWidget) => void): void {
    if (widget instanceof ChangesWidget) {
      run(widget);
    }
  }
}
```

The toolbar items are limited to this widget through `isVisible` of each command. Pattern: `node_modules/@theia/outline-view/src/browser/outline-view-contribution.ts`.

- [ ] **Step 6: Write the style sheet and the front-end module**

`extensions/changes-view/src/browser/style/changes.css`:
```css
.ai1-changes .ai1-changes-caption {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: baseline;
  gap: 6px;
}

.ai1-changes .ai1-changes-name {
  white-space: nowrap;
}

.ai1-changes .ai1-changes-repo .ai1-changes-name {
  font-weight: 600;
}

.ai1-changes .ai1-changes-description {
  overflow: hidden;
  font-size: 0.9em;
  opacity: 0.7;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai1-changes .ai1-changes-repo-icon {
  margin-right: 6px;
}

.ai1-changes .ai1-changes-tail {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.ai1-changes .ai1-changes-action {
  display: none;
  cursor: pointer;
}

.ai1-changes .theia-TreeNode:hover .ai1-changes-action {
  display: inline-block;
}

.ai1-changes .ai1-changes-badge {
  min-width: 12px;
  font-size: 0.85em;
  text-align: center;
}

.ai1-changes .ai1-changes-badge-M {
  color: var(--theia-gitDecoration-modifiedResourceForeground);
}

.ai1-changes .ai1-changes-badge-A,
.ai1-changes .ai1-changes-badge-U {
  color: var(--theia-gitDecoration-untrackedResourceForeground);
}

.ai1-changes .ai1-changes-badge-D {
  color: var(--theia-gitDecoration-deletedResourceForeground);
}

.ai1-changes .ai1-changes-badge-R {
  color: var(--theia-gitDecoration-renamedResourceForeground);
}
```

`extensions/changes-view/src/browser/changes-frontend-module.ts`:
```ts
import "../../src/browser/style/changes.css";

import { bindViewContribution, createTreeContainer, FrontendApplicationContribution, WidgetFactory } from "@theia/core/lib/browser";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { TabBarToolbarContribution } from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { ResourceResolver } from "@theia/core/lib/common/resource";
import { ContainerModule, interfaces } from "@theia/core/shared/inversify";
import { CHANGES_SERVICE_PATH, ChangesService } from "../common/changes-protocol";
import { ChangesContribution } from "./changes-contribution";
import { ChangesWidget } from "./changes-widget";
import { HeadResourceResolver } from "./head-resource-resolver";

function createChangesWidget(parent: interfaces.Container): ChangesWidget {
  const child = createTreeContainer(parent, {
    props: { search: false, multiSelect: false, virtualized: true },
    widget: ChangesWidget,
  });
  return child.get(ChangesWidget);
}

export default new ContainerModule((bind) => {
  bind(ChangesService)
    .toDynamicValue((context) => ServiceConnectionProvider.createProxy<ChangesService>(context.container, CHANGES_SERVICE_PATH))
    .inSingletonScope();

  bind(HeadResourceResolver).toSelf().inSingletonScope();
  bind(ResourceResolver).toService(HeadResourceResolver);

  bind(ChangesWidget).toDynamicValue((context) => createChangesWidget(context.container));
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: ChangesWidget.ID,
      createWidget: () => context.container.get(ChangesWidget),
    }))
    .inSingletonScope();

  bindViewContribution(bind, ChangesContribution);
  bind(FrontendApplicationContribution).toService(ChangesContribution);
  bind(TabBarToolbarContribution).toService(ChangesContribution);
});
```

Compile check point: the second argument of `createTreeContainer`. Read `node_modules/@theia/core/src/browser/tree/tree-container.ts` and the pattern `node_modules/@theia/outline-view/src/browser/outline-view-frontend-module.ts`. Use the same form as the pattern.

- [ ] **Step 7: Build and check**

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm run build
```
Expected: no `tsc` error and no esbuild error.

Make a temporary folder outside the repository with two sibling git repositories (one clean, one with a changed `index.ts`). Use `git -c user.name="AI1 Test" -c user.email="test@ai1.invalid"` for the commits. Start the app on that folder in the background with a fresh settings folder (`THEIA_CONFIG_DIR="$(mktemp -d)"`), and write the output to a log for 90 seconds. Expected: the log has no error that names `ai1-changes`, `ChangesWidget`, `ChangesService`, or `ai1-head`. Stop the app and delete the folders.

List under "Visual checks for the user": the Changes view is on the right; only the dirty repository shows; the file row has a Material icon, the folder as gray text, and a colored `M`; a single click opens the diff with `HEAD` on the left; the three toolbar buttons work; the row buttons show on hover; discard asks for confirmation.

- [ ] **Step 8: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors, `40 passing` for this workspace.

```bash
git add extensions/changes-view package-lock.json
git commit -m "Add the Changes view" -m "A tree widget in the right area shows the repositories that have uncommitted changes and their files. A single click opens the diff of HEAD against the working file; a resource resolver gives the HEAD content, so no temporary file is written. The view refreshes on file changes with a debounce and keeps the expansion state across a refresh."
```

---

### Task 6: The `shell-layout` extension

**Files:**
- Create: `extensions/shell-layout/package.json`, `extensions/shell-layout/tsconfig.json`
- Create: `extensions/shell-layout/src/browser/default-preferences.ts`, test `default-preferences.spec.ts`
- Create: `extensions/shell-layout/src/browser/default-preferences-contribution.ts`
- Create: `extensions/shell-layout/src/browser/ai-features-off-state.ts`, test `ai-features-off-state.spec.ts`
- Create: `extensions/shell-layout/src/browser/ai-features-off-service.ts`
- Create: `extensions/shell-layout/src/browser/shell-layout-contribution.ts`
- Create: `extensions/shell-layout/src/browser/shell-layout-frontend-module.ts`
- Modify: `applications/electron/package.json`

**Interfaces:**
- Consumes: `FileNavigatorContribution` from `@theia/navigator/lib/browser/navigator-contribution`; `PreferenceService`, `PreferenceScope` from `@theia/core/lib/common/preferences`; `AIActivationService`, `ENABLE_AI_CONTEXT_KEY` from `@theia/ai-core/lib/browser/ai-activation-service`. It does not import `changes-view`: that view opens itself on the right (Task 5).
- Produces: on the first start, the explorer (DOM id `files`) in the `left` area. Default preferences in the user settings. The context key `ai-features.AiEnable.enableAI` is `false`.

- [ ] **Step 1: Create the package files**

`extensions/shell-layout/package.json`:
```json
{
  "name": "ai1-shell-layout",
  "version": "0.1.0",
  "private": true,
  "description": "Default layout and default preferences of AI1. It also turns the Theia AI features off.",
  "keywords": ["theia-extension"],
  "files": ["lib", "src"],
  "dependencies": {
    "@theia/ai-core": "1.75.0",
    "@theia/core": "1.75.0",
    "@theia/navigator": "1.75.0"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "^20.0.0",
    "mocha": "^10.0.0",
    "rimraf": "^5.0.0",
    "typescript": "~5.4.5"
  },
  "scripts": {
    "clean": "rimraf lib",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "tsc && mocha \"lib/**/default-preferences.spec.js\" \"lib/**/ai-features-off-state.spec.js\""
  },
  "theiaExtensions": [
    {
      "frontend": "lib/browser/shell-layout-frontend-module"
    }
  ]
}
```

`@theia/ai-core` is a dependency for one reason: Theia loads extension modules in dependency order, and the `rebind` in Step 6 works only after the `ai-core` module made the first binding.

`extensions/shell-layout/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib",
    "types": ["node", "mocha"]
  },
  "include": ["src"]
}
```

Run: `npm install`
Expected: no error.

- [ ] **Step 2: Write the failing tests**

`extensions/shell-layout/src/browser/default-preferences.spec.ts`:
```ts
import * as assert from "node:assert";
import { DEFAULT_PREFERENCES, PreferenceState, selectUnsetDefaults } from "./default-preferences";

const state = (known: boolean, setByUser: boolean): PreferenceState => ({ known, setByUser });

describe("selectUnsetDefaults", () => {
  it("returns a default when the preference is known and the user did not set it", () => {
    const result = selectUnsetDefaults({ "editor.tabSize": 2 }, () => state(true, false));
    assert.deepStrictEqual(result, { "editor.tabSize": 2 });
  });

  it("leaves out a preference that the user already set", () => {
    const result = selectUnsetDefaults({ "editor.tabSize": 2 }, () => state(true, true));
    assert.deepStrictEqual(result, {});
  });

  it("leaves out a preference that the application does not know", () => {
    const result = selectUnsetDefaults({ "editor.notReal": true }, () => state(false, false));
    assert.deepStrictEqual(result, {});
  });

  it("decides each preference separately", () => {
    const states: Record<string, PreferenceState> = {
      "editor.tabSize": state(true, false),
      "editor.formatOnSave": state(true, true),
      "editor.notReal": state(false, false),
    };
    const result = selectUnsetDefaults(
      { "editor.tabSize": 2, "editor.formatOnSave": true, "editor.notReal": true },
      (name) => states[name],
    );
    assert.deepStrictEqual(result, { "editor.tabSize": 2 });
  });
});

describe("DEFAULT_PREFERENCES", () => {
  it("runs the ESLint fixes on save in explicit mode", () => {
    assert.deepStrictEqual(DEFAULT_PREFERENCES["editor.codeActionsOnSave"], {
      "source.fixAll.eslint": "explicit",
    });
  });

  it("shows whitespace changes in diffs", () => {
    assert.strictEqual(DEFAULT_PREFERENCES["diffEditor.ignoreTrimWhitespace"], false);
  });
});
```

The AI service class imports Theia browser code, which does not load under mocha in Node. So its two constant values live in a file of their own, and the test covers that file.

`extensions/shell-layout/src/browser/ai-features-off-state.spec.ts`:
```ts
import * as assert from "node:assert";
import { AI_FEATURES_OFF } from "./ai-features-off-state";

describe("AI_FEATURES_OFF", () => {
  it("reports that the AI features are not active and cannot run", () => {
    assert.deepStrictEqual(AI_FEATURES_OFF, { isActive: false, canRun: false });
  });
});
```

Run: `npm test --workspace extensions/shell-layout`
Expected: FAIL. `tsc` reports `Cannot find module './default-preferences'` and `'./ai-features-off-state'`.

- [ ] **Step 3: Write the two pure files**

`extensions/shell-layout/src/browser/default-preferences.ts`:
```ts
// The preferences that AI1 sets on the first start. The list comes from the
// "Default preferences" section of the design document.
export const DEFAULT_PREFERENCES: Readonly<Record<string, unknown>> = {
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "dbaeumer.vscode-eslint",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "editor.tabSize": 2,
  "editor.minimap.enabled": false,
  "editor.stickyScroll.enabled": true,
  "editor.enablePreview": false,
  "diffEditor.ignoreTrimWhitespace": false,
};

export interface PreferenceState {
  // The application has a schema for this preference.
  known: boolean;
  // The user settings file already contains a value for this preference.
  setByUser: boolean;
}

// Returns the defaults that are safe to write: the application knows the
// preference, and the user did not choose a value.
export function selectUnsetDefaults(
  defaults: Readonly<Record<string, unknown>>,
  stateOf: (name: string) => PreferenceState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(defaults)) {
    const { known, setByUser } = stateOf(name);
    if (known && !setByUser) {
      result[name] = value;
    }
  }
  return result;
}
```

`extensions/shell-layout/src/browser/ai-features-off-state.ts`:
```ts
// The fixed state of the Theia AI features in AI1. Theia uses `isActive` for
// the visibility of AI commands and `canRun` for their enablement.
export const AI_FEATURES_OFF = { isActive: false, canRun: false } as const;
```

Run: `npm test --workspace extensions/shell-layout`
Expected: PASS, `7 passing`.

- [ ] **Step 4: Write the contribution that applies the defaults**

`extensions/shell-layout/src/browser/default-preferences-contribution.ts`:
```ts
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DEFAULT_PREFERENCES, selectUnsetDefaults } from "./default-preferences";

@injectable()
export class DefaultPreferencesContribution implements FrontendApplicationContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  async onStart(): Promise<void> {
    await this.preferences.ready;
    const toSet = selectUnsetDefaults(DEFAULT_PREFERENCES, (name) => {
      const inspection = this.preferences.inspect(name);
      return {
        known: inspection !== undefined && inspection.defaultValue !== undefined,
        setByUser: inspection !== undefined && inspection.globalValue !== undefined,
      };
    });
    for (const [name, value] of Object.entries(toSet)) {
      try {
        await this.preferences.set(name, value, PreferenceScope.User);
      } catch (error) {
        console.warn(`ai1-shell-layout: could not set the default for ${name}`, error);
      }
    }
  }
}
```

- [ ] **Step 5: Write the AI activation service and the layout contribution**

`extensions/shell-layout/src/browser/ai-features-off-service.ts`:
```ts
import { AIActivationService, ENABLE_AI_CONTEXT_KEY } from "@theia/ai-core/lib/browser/ai-activation-service";
import { Emitter, Event } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ContextKeyService } from "@theia/core/lib/browser/context-key-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { AI_FEATURES_OFF } from "./ai-features-off-state";

// AI1 shows no Theia AI user interface. The VS Code extension host depends on
// @theia/ai-core, so that package loads. Its default activation service is
// always active, and no preference controls it. This service replaces it with
// one that is always off.
@injectable()
export class AiFeaturesOffService implements AIActivationService, FrontendApplicationContribution {
  @inject(ContextKeyService)
  protected readonly contextKeyService!: ContextKeyService;

  readonly isActive = AI_FEATURES_OFF.isActive;
  readonly canRun = AI_FEATURES_OFF.canRun;

  protected readonly activeStatusEmitter = new Emitter<boolean>();
  protected readonly canRunEmitter = new Emitter<boolean>();

  get onDidChangeActiveStatus(): Event<boolean> {
    return this.activeStatusEmitter.event;
  }

  get onDidChangeCanRun(): Event<boolean> {
    return this.canRunEmitter.event;
  }

  initialize(): void {
    this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
  }
}
```

`extensions/shell-layout/src/browser/shell-layout-contribution.ts`:
```ts
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileNavigatorContribution } from "@theia/navigator/lib/browser/navigator-contribution";

// Theia calls initializeLayout only when no saved layout exists. So this
// default applies on the first start, and later manual changes stay. The
// Changes view opens itself in the right area.
@injectable()
export class ShellLayoutContribution implements FrontendApplicationContribution {
  @inject(FileNavigatorContribution)
  protected readonly navigator!: FileNavigatorContribution;

  async initializeLayout(): Promise<void> {
    await this.navigator.openView({ area: "left", reveal: true });
  }
}
```

- [ ] **Step 6: Write the front-end module**

`extensions/shell-layout/src/browser/shell-layout-frontend-module.ts`:
```ts
import { AIActivationService } from "@theia/ai-core/lib/browser/ai-activation-service";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ContainerModule } from "@theia/core/shared/inversify";
import { AiFeaturesOffService } from "./ai-features-off-service";
import { DefaultPreferencesContribution } from "./default-preferences-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ShellLayoutContribution);

  bind(DefaultPreferencesContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(DefaultPreferencesContribution);

  // The ai-core module already binds FrontendApplicationContribution to the
  // AIActivationService symbol. After the rebind, Theia calls initialize() of
  // the new service. A second contribution binding is not necessary.
  bind(AiFeaturesOffService).toSelf().inSingletonScope();
  rebind(AIActivationService).toService(AiFeaturesOffService);
});
```

- [ ] **Step 7: Add the extension to the application, build, and check**

In `applications/electron/package.json`, add to `dependencies`: `"ai1-shell-layout": "0.1.0"`

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm install
npm run build
```
Expected: no error.

Start the app in the background with a fresh settings folder (`THEIA_CONFIG_DIR="$(mktemp -d)"`) on a temporary folder, for 90 seconds. Expected in the log: no error that names `AIActivationService` (in particular no `No matching bindings found`). After the stop, the file `settings.json` inside that settings folder contains `"editor.tabSize": 2` and `"editor.formatOnSave": true`. Put the content of the file in the report. Delete the folders.

If the log reports `No matching bindings found for serviceIdentifier: Symbol(AIActivationService)`, the module order is wrong. Report it as a concern with the log lines.

List under "Visual checks for the user": no AI menu entry, AI view, or AI settings category shows; the explorer is on the left; a panel that the user moves by hand stays there after a restart; a save of a TypeScript file with a fixable ESLint problem fixes it.

- [ ] **Step 8: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors, `7 passing` for this workspace.

```bash
git add extensions/shell-layout applications/electron/package.json package-lock.json
git commit -m "Add the shell-layout extension" -m "On the first start the explorer opens on the left. The extension writes the default preferences to the user settings, but only the ones that the user did not set. It replaces the Theia AI activation service with one that is always off, because the VS Code extension host loads the AI core package."
```

---

### Task 7: Packaging script

**Files:**
- Create: `applications/electron/electron-builder.yml`
- Create: `scripts/package-mac.sh`
- Modify: `applications/electron/package.json` (add `electron-builder`)

**Interfaces:**
- Consumes: root scripts `build:production` and `download:plugins`; the main script; the folders `plugins` and `resources/material-icons`.
- Produces: `applications/electron/dist/mac-arm64/AI1.app`, and with `--install` the app `/Applications/AI1.app`.

- [ ] **Step 1: Make `build:production` cover all extensions, and add electron-builder**

In the root `package.json`, replace the `build:production` script with:
```json
    "build:production": "npm run build --workspace extensions/material-icons && npm run build --workspace extensions/changes-view && npm run build --workspace extensions/shell-layout && npm run build:production --workspace applications/electron",
```

In `applications/electron/package.json`, add to `devDependencies`: `"electron-builder": "^26.0.0"`

Run: `npm install`
Expected: no error.

- [ ] **Step 2: Create `applications/electron/electron-builder.yml`**

Theia bundles the back end into `lib/`, with the native modules beside it. So the package does not need `node_modules`.

```yaml
appId: dev.ai1.app
productName: AI1
electronVersion: 42.8.1
asar: false
npmRebuild: false
directories:
  output: dist
files:
  - package.json
  - scripts
  - lib
  - src-gen
  - plugins
  - resources
  - "!**/*.map"
mac:
  target:
    - target: dir
      arch:
        - arm64
  identity: null
  category: public.app-category.developer-tools
```

`identity: null` stops electron-builder from signing. The script signs ad-hoc. This prevents the use of a Developer ID certificate from a keychain.

- [ ] **Step 3: Create `scripts/package-mac.sh`**

```bash
#!/usr/bin/env bash
# Builds the production app for macOS arm64, signs it ad-hoc, and with
# --install copies it to /Applications.
set -euo pipefail

export CC=/usr/bin/cc CXX=/usr/bin/c++
export CSC_IDENTITY_AUTO_DISCOVERY=false

cd "$(dirname "$0")/.."

npm run download:plugins
npm run build:production
npm exec --workspace applications/electron -- electron-builder --config electron-builder.yml --mac --arm64 --publish never

APP="applications/electron/dist/mac-arm64/AI1.app"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
echo "Packaged: $APP"

if [ "${1:-}" = "--install" ]; then
  TARGET="/Applications/AI1.app"
  rm -rf "$TARGET"
  ditto "$APP" "$TARGET"
  echo "Installed: $TARGET"
fi
```

Run: `chmod +x scripts/package-mac.sh`

- [ ] **Step 4: Package without install and check the result**

Run: `scripts/package-mac.sh`
Expected: the last line is `Packaged: applications/electron/dist/mac-arm64/AI1.app`. The script ends with exit code 0.

Run:
```bash
R=applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app
codesign -dv applications/electron/dist/mac-arm64/AI1.app 2>&1 | grep -E "Signature|Identifier"
ls $R/plugins | wc -l
ls $R/resources/material-icons/icons | wc -l
file applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1
```
Expected: `Signature=adhoc`. Plugins `15`. Icons `1251`. The binary is `Mach-O 64-bit executable arm64`.

- [ ] **Step 5: Start the packaged app and check it**

Start `applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1 <temporary meta-repo folder>` in the background with the output in a log, for 90 seconds. Find the port in the log and run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/ai1-material-icons/icons/typescript.svg"
```
Expected: `200`. The log names the language extensions and has no error about a missing native module, `ai1-changes`, or `AI1_MATERIAL_ICONS_DIR`. Stop the app.

If the app stops at start with a missing native module, add the reported folder to `files` in `electron-builder.yml`.

- [ ] **Step 6: Install**

Run: `scripts/package-mac.sh --install`
Expected: the last line is `Installed: /Applications/AI1.app`.

- [ ] **Step 7: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors.

```bash
git add applications/electron/electron-builder.yml applications/electron/package.json package.json package-lock.json scripts/package-mac.sh
git commit -m "Add the macOS packaging script" -m "The script makes a production build for arm64 and signs it ad-hoc. It never uses automatic certificate discovery. The package contains the language extensions and the Material icon files."
```

---

### Task 8: End-to-end smoke test

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`
- Create: `e2e/src/meta-repo-fixture.ts`
- Test: `e2e/src/m1-smoke.spec.ts`
- Modify: `package.json` (the `test:e2e` script)

**Interfaces:**
- Consumes: the development build and the plugins folder. DOM ids `files` (explorer) and `ai1-changes` (Changes view). CSS classes `ai1-changes-repo`, `ai1-changes-file`, `ai1-mi`.
- Produces: the root command `npm run test:e2e`. `createMetaRepoFixture(root: string): void`, which M2 and M3 tests use again.

- [ ] **Step 1: Create the package files**

`e2e/package.json`:
```json
{
  "name": "ai1-e2e",
  "version": "0.1.0",
  "private": true,
  "description": "End-to-end smoke tests of AI1",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:e2e": "USE_ELECTRON=true playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@theia/playwright": "1.75.0",
    "@types/node": "^20.0.0",
    "typescript": "~5.4.5"
  }
}
```

`e2e/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "playwright.config.ts"]
}
```

`e2e/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
```

Add to the root `package.json` scripts: `"test:e2e": "npm run test:e2e --workspace e2e",`

Run: `npm install`, then `npx --workspace e2e playwright install chromium`
Expected: no error. The test asks Playwright for its `browser` fixture, so Playwright needs its Chromium download even though the test drives Electron.

- [ ] **Step 2: Write the fixture helper**

`e2e/src/meta-repo-fixture.ts`:
```ts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=AI1 Test", "-c", "user.email=test@ai1.invalid", ...args], { cwd });
}

function createRepo(root: string, name: string): string {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "index.ts"), "export const value = 1;\n");
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "Initial commit");
  return repo;
}

// Makes a meta-repo in `root`: two sibling git repositories. `clean-repo` has
// no changes. `dirty-repo` has one changed file, `index.ts`.
export function createMetaRepoFixture(root: string): void {
  createRepo(root, "clean-repo");
  const dirty = createRepo(root, "dirty-repo");
  fs.writeFileSync(path.join(dirty, "index.ts"), "export const value = 2;\n");
}
```

- [ ] **Step 3: Write the test**

`e2e/src/m1-smoke.spec.ts`:
```ts
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;

test.beforeAll(async ({ playwright, browser }) => {
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  app = await TheiaAppLoader.load({ playwright, browser, useElectron: { electronAppPath, pluginsPath } }, workspace);
});

test.afterAll(async () => {
  await app.page.close();
});

test("the explorer is in the left panel", async () => {
  await expect(app.page.locator("div.theia-left-side-panel #files")).toBeVisible();
});

test("the explorer shows Material icons", async () => {
  await expect(app.page.locator("#files .ai1-mi").first()).toBeVisible();
});

test("the Changes view is in the right panel", async () => {
  await expect(app.page.locator("div.theia-right-side-panel #ai1-changes")).toBeVisible();
});

test("the Changes view lists only the dirty repository", async () => {
  const repos = app.page.locator("#ai1-changes .ai1-changes-repo");
  await expect(repos).toHaveCount(1);
  await expect(repos.first()).toContainText("dirty-repo");
  await expect(repos.first()).toContainText("main");
});

test("a single click on a changed file opens a diff in the center", async () => {
  await app.page.locator("#ai1-changes .ai1-changes-file", { hasText: "index.ts" }).click();
  const diff = app.page.locator("#theia-main-content-panel .monaco-diff-editor");
  await expect(diff).toBeVisible();
  await expect(diff).toContainText("value = 1");
  await expect(diff).toContainText("value = 2");
});

test("no Theia AI user interface shows", async () => {
  await expect(app.page.locator("[id*='ai-chat'], [id*='ai-configuration']")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the test without a build of the app to make sure that it fails**

Run:
```bash
mv applications/electron/lib applications/electron/lib.off
npm run test:e2e || true
mv applications/electron/lib.off applications/electron/lib
```
Expected: FAIL in `beforeAll`, because the Electron main module does not exist. This proves that the test starts the real app. The `|| true` makes sure that the third command restores the folder.

- [ ] **Step 5: Run the test against the built app**

Run: `npm run build && npm run test:e2e`
Expected: PASS, `6 passed`.

If a locator fails, open the trace (`npx playwright show-trace e2e/test-results/<folder>/trace.zip`) and read the real DOM. Correct the locator in the test when the application is right and the locator is wrong. When the trace shows a real defect (for example no icons, the view on the left, no diff on a single click), report it as a concern with the evidence. Do not change application code in this task.

- [ ] **Step 6: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors.

```bash
git add e2e package.json package-lock.json
git commit -m "Add the M1 end-to-end smoke test" -m "The test starts the Electron app on a generated meta-repo with one clean and one dirty repository. It checks the panel positions, the Material icons, the Changes list, the diff on a single click, and that no Theia AI user interface shows."
```

---

### Task 9: File watcher measurement and M1 close

**Files:**
- Create: `docs/m1-measurements.md`

**Interfaces:**
- Consumes: the installed app `/Applications/AI1.app` from Task 7.
- Produces: a recorded result that the M2 spec reads.

- [ ] **Step 1: Measure the load on a real meta-repo**

Start `/Applications/AI1.app` and open a real meta-repo folder with 20 or more sibling repositories that have `node_modules` installed. Wait 2 minutes with no input. Then run:

```bash
ps -axo rss,%cpu,command | grep -i "AI1.app" | grep -v grep | awk '{rss+=$1; cpu+=$2} END {printf "processes=%d rss_mb=%.0f cpu_percent=%.1f\n", NR, rss/1024, cpu}'
```

Then save one file in one repository and measure the time until the Changes view shows it.

- [ ] **Step 2: Record the result**

`docs/m1-measurements.md`, with the measured values in place of each `<number>`:
```markdown
# M1 measurements

Date: <date of the measurement>
Workspace: a meta-repo with <number> sibling repositories, `node_modules` installed.

| Measurement | Result |
|---|---|
| Processes | <number> |
| Memory at idle (RSS, all processes) | <number> MB |
| CPU at idle, 2 minutes after start | <number> % |
| Time from save to the row in the Changes view | <number> s |

## Conclusion

<One of these two sentences.>
The idle load is acceptable. No change of the file watcher configuration is necessary.
The idle CPU is more than 5 %. The M2 spec must add `files.watcherExclude` defaults for `**/node_modules/**`, `**/dist/**`, and `**/lib/**`.
```

The `<number>` marks are fields that the engineer fills with measured values in this step. The committed file contains no `<...>` mark, no folder path, and no name of a private project.

- [ ] **Step 3: Check all eight M1 criteria of the spec**

| # | Criterion | Proof |
|---|---|---|
| 1 | Opens a meta-repo folder | Step 1 of this task |
| 2 | Material icons in the explorer | Task 8, test 2 |
| 3 | Changes view on the right, dirty repositories only | Task 8, tests 3 and 4 |
| 4 | Click opens the diff in the center | Task 8, test 5 |
| 5 | Go-to-definition and autocomplete | In the installed app, in a real TypeScript repository |
| 6 | ESLint fix on save | In the installed app, in a real TypeScript repository |
| 7 | One script packages and installs | Task 7 Step 6 |
| 8 | Lint and type check pass | `npm run lint && npm run typecheck` |

- [ ] **Step 4: Commit and push**

```bash
git add docs/m1-measurements.md
git commit -m "Record the M1 file watcher measurements"
git push
```
