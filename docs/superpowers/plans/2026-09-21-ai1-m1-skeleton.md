# AI1 M1 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A packaged AI1 desktop app that opens a meta-repo folder with the explorer on the left, the Changes view on the right, editor and diffs in the center, TypeScript IntelliSense, and ESLint fix on save.

**Architecture:** An npm workspaces monorepo. One Electron application package composes pinned `@theia/*` packages. One Theia extension (`shell-layout`) sets the default layout and default preferences. The changes view is the copied source of the `metarepo-sc` VS Code extension, built with esbuild into the plugins folder. Third-party VS Code extensions come from Open VSX at build time.

**Tech Stack:** Eclipse Theia 1.75.0, Electron 42.8.1, Node 24, npm workspaces, TypeScript, esbuild, electron-builder, mocha, `@theia/playwright`.

**Spec:** `docs/superpowers/specs/2026-09-21-ai1-design.md`

## Global Constraints

- All `@theia/*` packages at exactly `1.75.0`. No `^` and no `~`.
- `electron` at exactly `42.8.1`.
- Node 24. Package manager: npm with workspaces. No lerna, no yarn.
- Platform: macOS arm64 only.
- Packaging uses ad-hoc signing. The build never uses automatic certificate discovery: `CSC_IDENTITY_AUTO_DISCOVERY=false` is always set.
- Native builds use `CC=/usr/bin/cc CXX=/usr/bin/c++`.
- Code style: 2 spaces, double quotes, Prettier with `printWidth: 110`.
- Test files contain no divider comments (for example `// --- section ---`).
- Commit messages contain no `Co-Authored-By` line.
- Commit messages, comments, and documents contain none of these: local user names, home folder paths, names of private projects.
- Lint and type check pass before each commit.

## Deviations from the spec, decided during planning

1. **Folder of the bundled extensions.** The spec shows `plugins/` at the repository root. This plan uses `applications/electron/plugins/`. Reason: the packaged app and the development app then find the folder with the same relative path.
2. **Scaffold.** The generator output is five small template files with a fixed layout (`electron-app/` at the root, lerna). This plan writes the same files by hand in the spec layout (`applications/electron`, `extensions/*`) and uses npm workspaces. The file contents follow the generator templates of version 0.1.49.
3. **Sticky scroll in trees.** Theia 1.75 has no preference for it. The default preference list leaves it out.
4. **Tests of the copied extension.** The original tests need the VS Code test runner. M1 does not copy them. The end-to-end test of Task 5 covers the extension inside AI1.

## File Structure

```
ai1/
├── package.json                         workspaces, scripts, theiaPlugins list
├── .nvmrc  .gitignore  .prettierrc  eslint.config.mjs  tsconfig.base.json  README.md
├── applications/electron/
│   ├── package.json                     pinned @theia/* packages, Theia app config
│   ├── scripts/ai1-electron-main.js     sets the plugins folder, then starts Theia
│   ├── electron-builder.yml             packaging config (Task 4)
│   └── plugins/                         build output, not in git
├── extensions/shell-layout/
│   ├── package.json  tsconfig.json
│   └── src/browser/
│       ├── default-preferences.ts       the list of defaults + the pure selection function
│       ├── default-preferences.spec.ts
│       ├── default-preferences-contribution.ts   applies the defaults once, at start
│       ├── shell-layout-contribution.ts          explorer left, SCM container right
│       └── shell-layout-frontend-module.ts       dependency injection bindings
├── vscode-extensions/metarepo-sc/
│   ├── package.json  tsconfig.json  esbuild.mjs  LICENSE  icon.png
│   ├── src/extension.ts                 copied source
│   └── scripts/install-plugin.mjs       copies the built extension into plugins/
├── e2e/
│   ├── package.json  tsconfig.json  playwright.config.ts
│   └── src/
│       ├── meta-repo-fixture.ts         makes one clean repo and one dirty repo
│       └── m1-smoke.spec.ts
├── scripts/package-mac.sh               build, package, sign, install
└── docs/m1-measurements.md              file watcher load result (Task 6)
```

---

### Task 1: Workspace skeleton and an Electron app that starts

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `.prettierrc`, `eslint.config.mjs`, `tsconfig.base.json`, `README.md`
- Create: `applications/electron/package.json`
- Create: `applications/electron/scripts/ai1-electron-main.js`

**Interfaces:**
- Consumes: nothing.
- Produces: root scripts `build`, `build:production`, `start`, `lint`, `typecheck`, `test`, `download:plugins`. The plugins folder `applications/electron/plugins`. Later tasks add workspaces, and the root scripts find them through `--workspaces --if-present`.

- [ ] **Step 1: Make sure that the correct npm runs**

Node 24 contains npm 11. An older npm earlier in `PATH` breaks workspaces installs.

Run: `node --version && npm --version && which -a npm`
Expected: Node `v24.x`. npm `11.x` or later.

If npm is older than 10, the first `npm` in `PATH` is not the one from Node 24. Run `nvm use 24` in the shell, and if the old npm is still first, call npm by its full path: `"$(dirname "$(nvm which 24)")/npm"`. Use that npm for all later steps.

- [ ] **Step 2: Create `.nvmrc`, `.gitignore`, `.prettierrc`**

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules
lib
dist
src-gen
gen-webpack.config.js
gen-webpack.node.config.js
*.log
*.tsbuildinfo
.DS_Store
applications/electron/plugins
applications/electron/webpack.config.js
e2e/test-results
e2e/playwright-report
```

`.prettierrc`:
```json
{
  "printWidth": 110
}
```

- [ ] **Step 3: Create the root `package.json`**

```json
{
  "private": true,
  "name": "ai1",
  "version": "0.1.0",
  "description": "AI1 (All In 1): a personal IDE for work with coding agents across a meta-repo",
  "engines": {
    "node": ">=24"
  },
  "workspaces": [
    "extensions/*",
    "vscode-extensions/*",
    "applications/*",
    "e2e"
  ],
  "scripts": {
    "postinstall": "theia check:theia-version",
    "download:plugins": "theia download:plugins",
    "build": "npm run build --workspaces --if-present",
    "build:production": "npm run build --workspace extensions/shell-layout --if-present && npm run build --workspace vscode-extensions/metarepo-sc --if-present && npm run build:production --workspace applications/electron",
    "start": "npm start --workspace applications/electron",
    "lint": "eslint .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm test --workspaces --if-present",
    "format": "prettier --write \"**/*.{ts,js,mjs,json,md,yml}\"",
    "format:check": "prettier --check \"**/*.{ts,js,mjs,json,md,yml}\""
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@theia/cli": "1.75.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "~5.4.5",
    "typescript-eslint": "^8.0.0"
  },
  "theiaPluginsDir": "applications/electron/plugins",
  "theiaPlugins": {}
}
```

`theiaPlugins` is empty in this task. Task 2 fills it.

- [ ] **Step 4: Create `tsconfig.base.json` and `eslint.config.mjs`**

`tsconfig.base.json` (from the generator template, plus `strict`):
```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "noEmitOnError": false,
    "noUnusedLocals": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "downlevelIteration": true,
    "resolveJsonModule": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "ES2017",
    "jsx": "react",
    "lib": ["ES2017", "dom"],
    "sourceMap": true
  }
}
```

`eslint.config.mjs`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/dist/**",
      "**/src-gen/**",
      "**/plugins/**",
      "**/gen-webpack*.js",
      "**/webpack.config.js",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: { require: "readonly", module: "readonly", process: "readonly", __dirname: "readonly", console: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
```

- [ ] **Step 5: Create `applications/electron/package.json`**

```json
{
  "private": true,
  "name": "ai1-electron",
  "productName": "AI1",
  "version": "0.1.0",
  "description": "AI1 desktop application",
  "main": "scripts/ai1-electron-main.js",
  "dependencies": {
    "@theia/core": "1.75.0",
    "@theia/editor": "1.75.0",
    "@theia/electron": "1.75.0",
    "@theia/file-search": "1.75.0",
    "@theia/filesystem": "1.75.0",
    "@theia/keymaps": "1.75.0",
    "@theia/markers": "1.75.0",
    "@theia/messages": "1.75.0",
    "@theia/monaco": "1.75.0",
    "@theia/navigator": "1.75.0",
    "@theia/outline-view": "1.75.0",
    "@theia/plugin-ext": "1.75.0",
    "@theia/plugin-ext-vscode": "1.75.0",
    "@theia/preferences": "1.75.0",
    "@theia/process": "1.75.0",
    "@theia/scm": "1.75.0",
    "@theia/search-in-workspace": "1.75.0",
    "@theia/terminal": "1.75.0",
    "@theia/vsx-registry": "1.75.0",
    "@theia/workspace": "1.75.0"
  },
  "devDependencies": {
    "@theia/cli": "1.75.0",
    "electron": "42.8.1"
  },
  "scripts": {
    "rebuild": "theia rebuild:electron --cacheRoot ../..",
    "build": "npm run rebuild && theia build --mode development",
    "build:production": "npm run rebuild && theia build --mode production",
    "start": "theia start",
    "watch": "npm run rebuild && theia build --watch --mode development"
  },
  "theia": {
    "target": "electron",
    "frontend": {
      "config": {
        "applicationName": "AI1",
        "defaultTheme": "dark",
        "defaultIconTheme": "material-icon-theme"
      }
    }
  }
}
```

The list has no `@theia/ai-*`, `@theia/debug`, `@theia/notebook`, `@theia/collaboration`, `@theia/remote`, `@theia/dev-container`, and no `@theia/getting-started`. This is the "Left out" list of the spec.

- [ ] **Step 6: Create `applications/electron/scripts/ai1-electron-main.js`**

```js
// Entry point of the Electron app. It tells Theia where the bundled VS Code
// extensions are, then it starts the generated Theia main module. The plugins
// folder has the same relative position in development and in the packaged app.
const path = require("path");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;

require("../lib/backend/electron-main.js");
```

- [ ] **Step 7: Create `README.md`**

```markdown
# AI1

AI1 means "All In 1". It is a personal desktop IDE for work with coding agents
across a meta-repo: one folder that contains many sibling git repositories.

The design is in `docs/superpowers/specs/`. The plans are in `docs/superpowers/plans/`.

## Requirements

- macOS on arm64
- Node 24 (`nvm use`)
- Xcode command line tools and Python 3

## Commands

| Command | Function |
|---|---|
| `npm install` | Installs all workspaces |
| `npm run download:plugins` | Downloads the bundled VS Code extensions from Open VSX |
| `npm run build` | Builds the extensions and the app in development mode |
| `npm start` | Starts the app |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript type check |
| `npm test` | Runs the unit tests |
| `scripts/package-mac.sh --install` | Makes the packaged app and installs it in `/Applications` |

Native modules must build with the system compiler:

    export CC=/usr/bin/cc CXX=/usr/bin/c++
```

- [ ] **Step 8: Install and build**

Run:
```bash
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm install
npm run build
```
Expected: `npm install` ends with no error, and `theia check:theia-version` reports no version conflict. `npm run build` ends with webpack output that contains `compiled` and no `ERROR`. The folder `applications/electron/lib/backend/` now contains `electron-main.js`.

If `npm install` fails in a native module with a `ccache` or `libfmt` error, the `CC` and `CXX` variables are not set in that shell. Set them and run `npm install` again.

- [ ] **Step 9: Start the app and check it by hand**

Run: `npm start`
Expected: a window with the title AI1 opens in the dark theme. The menu has File, Edit, View. `File > Open Folder` opens a folder, and the explorer shows its files. No AI chat view exists and no welcome page shows. Close the app.

- [ ] **Step 10: Run the gates**

Run: `npm run lint && npm run format:check`
Expected: no errors. If `format:check` reports files, run `npm run format` and check again.

- [ ] **Step 11: Commit**

```bash
git add .nvmrc .gitignore .prettierrc eslint.config.mjs tsconfig.base.json README.md package.json package-lock.json applications/electron/package.json applications/electron/scripts/ai1-electron-main.js
git commit -m "Add the workspace skeleton and the Electron application" -m "The application composes pinned Theia 1.75.0 packages. The main script gives Theia the folder of the bundled VS Code extensions."
```

---

### Task 2: Bundled VS Code extensions

**Files:**
- Modify: `package.json` (the `theiaPlugins` object)
- Create: `vscode-extensions/metarepo-sc/package.json`, `tsconfig.json`, `esbuild.mjs`, `scripts/install-plugin.mjs`
- Copy: `vscode-extensions/metarepo-sc/src/extension.ts`, `LICENSE`, `icon.png`

**Interfaces:**
- Consumes: the plugins folder `applications/electron/plugins` and the root scripts from Task 1.
- Produces: the unpacked extension folder `applications/electron/plugins/metarepo-sc/`. The view with the id `metarepoSc.changes` in the Source Control view container. Task 3 and Task 5 rely on this id and on the view title `Workspace Changes`.

- [ ] **Step 1: Fill `theiaPlugins` in the root `package.json`**

Replace `"theiaPlugins": {}` with this object. Each URL was checked against Open VSX on 2026-09-21.

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
    "PKief.material-icon-theme": "https://open-vsx.org/api/PKief/material-icon-theme/5.38.1/file/PKief.material-icon-theme-5.38.1.vsix",
    "dbaeumer.vscode-eslint": "https://open-vsx.org/api/dbaeumer/vscode-eslint/3.0.34/file/dbaeumer.vscode-eslint-3.0.34.vsix"
  }
```

- [ ] **Step 2: Download the extensions**

Run: `npm run download:plugins`
Expected: the log shows one `downloaded` line for each of the 16 entries and no `failed` line.

Run: `ls applications/electron/plugins | wc -l`
Expected: `16`

- [ ] **Step 3: Copy the extension source**

The source repository is public. Clone the tag `v0.3.0` into a temporary folder and copy three files without changes:

```bash
mkdir -p vscode-extensions/metarepo-sc/src vscode-extensions/metarepo-sc/scripts
SRC="$(mktemp -d)"
git clone --quiet --depth 1 --branch v0.3.0 https://github.com/mattgle/meta-repo-source-control "$SRC"
cp "$SRC/src/extension.ts" vscode-extensions/metarepo-sc/src/extension.ts
cp "$SRC/LICENSE" "$SRC/icon.png" vscode-extensions/metarepo-sc/
rm -rf "$SRC"
```

Run: `wc -l vscode-extensions/metarepo-sc/src/extension.ts`
Expected: `531`

- [ ] **Step 4: Create `vscode-extensions/metarepo-sc/package.json`**

The `contributes` block is the same as in the source repository. The scripts and the dev dependencies are reduced to what AI1 needs.

```json
{
  "name": "metarepo-sc",
  "displayName": "Meta-Repo Source Control",
  "description": "Workspace Changes tree view for meta-repo workspaces. Copied source, built with AI1.",
  "version": "0.3.0",
  "private": true,
  "publisher": "mattgle",
  "license": "MIT",
  "icon": "icon.png",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["SCM Providers", "Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "views": {
      "scm": [
        {
          "id": "metarepoSc.changes",
          "name": "Workspace Changes",
          "icon": "$(repo-pull)",
          "contextualTitle": "Workspace Changes"
        }
      ]
    },
    "commands": [
      { "command": "metarepoSc.refresh", "title": "Refresh Workspace Changes", "category": "Meta-Repo SC", "icon": "$(refresh)" },
      { "command": "metarepoSc.openDiff", "title": "Open Diff", "category": "Meta-Repo SC", "icon": "$(diff)" },
      { "command": "metarepoSc.openFile", "title": "Open File", "category": "Meta-Repo SC", "icon": "$(go-to-file)" },
      { "command": "metarepoSc.expandAll", "title": "Expand All Repos", "category": "Meta-Repo SC", "icon": "$(expand-all)" },
      { "command": "metarepoSc.discardChanges", "title": "Discard Changes", "category": "Meta-Repo SC", "icon": "$(discard)" },
      { "command": "metarepoSc.discardAllChanges", "title": "Discard All Changes", "category": "Meta-Repo SC", "icon": "$(discard)" }
    ],
    "menus": {
      "view/title": [
        { "command": "metarepoSc.refresh", "when": "view == metarepoSc.changes", "group": "navigation@1" },
        { "command": "metarepoSc.expandAll", "when": "view == metarepoSc.changes", "group": "navigation@2" }
      ],
      "view/item/context": [
        { "command": "metarepoSc.openFile", "when": "view == metarepoSc.changes && viewItem == file", "group": "inline@1" },
        { "command": "metarepoSc.discardChanges", "when": "view == metarepoSc.changes && viewItem == file", "group": "inline@2" },
        { "command": "metarepoSc.discardAllChanges", "when": "view == metarepoSc.changes && viewItem == repo", "group": "inline@1" }
      ]
    },
    "viewsWelcome": [
      {
        "view": "metarepoSc.changes",
        "contents": "No changes to show, edited files will appear here as you save them.\n\n[Refresh](command:metarepoSc.refresh)"
      }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs --production && node scripts/install-plugin.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.24.0",
    "typescript": "~5.4.5"
  }
}
```

- [ ] **Step 5: Create `tsconfig.json` and `esbuild.mjs` for the extension**

`vscode-extensions/metarepo-sc/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

`vscode-extensions/metarepo-sc/esbuild.mjs`:
```js
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
});
```

- [ ] **Step 6: Create `vscode-extensions/metarepo-sc/scripts/install-plugin.mjs`**

Theia loads an unpacked VS Code extension from a folder that contains `package.json` and the files that it names.

```js
// Copies the built extension into the plugins folder of the Electron app.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(extensionRoot, "..", "..", "applications", "electron", "plugins", "metarepo-sc");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of ["package.json", "dist", "icon.png", "LICENSE"]) {
  await cp(path.join(extensionRoot, entry), path.join(target, entry), { recursive: true });
}
console.log(`metarepo-sc installed in ${target}`);
```

- [ ] **Step 7: Install, build, and check the output**

Run:
```bash
npm install
npm run build --workspace vscode-extensions/metarepo-sc
ls applications/electron/plugins/metarepo-sc applications/electron/plugins/metarepo-sc/dist
```
Expected: the first listing shows `LICENSE dist icon.png package.json`. The second listing shows `extension.js`.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Check the spec criteria by hand**

Make a test folder outside the repository with two sibling git repositories. One is clean. The other one has a changed TypeScript file and an ESLint configuration. Run `npm start` and open the test folder.

Expected:
1. The explorer shows Material icons (spec criterion 2).
2. `View > Source Control` shows a section `WORKSPACE CHANGES`. It lists the dirty repository only (criterion 3, without the position).
3. A click on the changed file opens a diff editor in the center (criterion 4).
4. In a `.ts` file, autocomplete shows members, and `F12` goes to a definition in a different file (criterion 5).
5. The changed file shows a colored `M` in the Workspace Changes view. This proves that the built-in Git extension gives the file decorations.

If item 5 fails, write the result in the commit body. It does not block this task, because the view still works. It is one of the two points that the spec asks M1 to prove.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vscode-extensions/metarepo-sc
git commit -m "Bundle the VS Code extensions and the copied changes view" -m "The build downloads 16 extensions from Open VSX at pinned versions. The metarepo-sc source is copied at version 0.3.0 and built with esbuild into the plugins folder."
```

---

### Task 3: The `shell-layout` extension

**Files:**
- Create: `extensions/shell-layout/package.json`, `extensions/shell-layout/tsconfig.json`
- Create: `extensions/shell-layout/src/browser/default-preferences.ts`
- Test: `extensions/shell-layout/src/browser/default-preferences.spec.ts`
- Create: `extensions/shell-layout/src/browser/default-preferences-contribution.ts`
- Create: `extensions/shell-layout/src/browser/shell-layout-contribution.ts`
- Create: `extensions/shell-layout/src/browser/shell-layout-frontend-module.ts`
- Modify: `applications/electron/package.json` (add the dependency)

**Interfaces:**
- Consumes: `ScmContribution` from `@theia/scm/lib/browser/scm-contribution`, `FileNavigatorContribution` from `@theia/navigator/lib/browser/navigator-contribution`, `ApplicationShell` and `FrontendApplicationContribution` from `@theia/core/lib/browser`, `PreferenceService` and `PreferenceScope` from `@theia/core/lib/common/preferences`.
- Produces:
  - `DEFAULT_PREFERENCES: Readonly<Record<string, unknown>>`
  - `interface PreferenceState { known: boolean; setByUser: boolean }`
  - `selectUnsetDefaults(defaults: Readonly<Record<string, unknown>>, stateOf: (name: string) => PreferenceState): Record<string, unknown>`
  - On the first start: the explorer in the `left` area and the SCM view container (DOM id `scm-view-container`) in the `right` area. Task 5 checks these positions.

- [ ] **Step 1: Create the package files**

`extensions/shell-layout/package.json`:
```json
{
  "name": "ai1-shell-layout",
  "version": "0.1.0",
  "private": true,
  "description": "Default layout and default preferences of AI1",
  "keywords": ["theia-extension"],
  "files": ["lib", "src"],
  "dependencies": {
    "@theia/core": "1.75.0",
    "@theia/navigator": "1.75.0",
    "@theia/scm": "1.75.0"
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
      "frontend": "lib/browser/shell-layout-frontend-module"
    }
  ]
}
```

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

- [ ] **Step 2: Write the failing test**

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

- [ ] **Step 3: Run the test to make sure that it fails**

Run: `npm test --workspace extensions/shell-layout`
Expected: FAIL. `tsc` reports `Cannot find module './default-preferences'`.

- [ ] **Step 4: Write the implementation**

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

- [ ] **Step 5: Run the test to make sure that it passes**

Run: `npm test --workspace extensions/shell-layout`
Expected: PASS, `6 passing`.

- [ ] **Step 6: Write the contribution that applies the defaults**

`extensions/shell-layout/src/browser/default-preferences-contribution.ts`:
```ts
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DEFAULT_PREFERENCES, selectUnsetDefaults } from "./default-preferences";

@injectable()
export class DefaultPreferencesContribution implements FrontendApplicationContribution {
  // The `!` tells TypeScript that the dependency injection container sets the
  // field. Strict mode reports an error without it.
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

A preference that Theia does not know is left out by `selectUnsetDefaults`, so a name that does not exist in Theia 1.75 causes no error.

- [ ] **Step 7: Write the layout contribution**

`extensions/shell-layout/src/browser/shell-layout-contribution.ts`:
```ts
import { ApplicationShell, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileNavigatorContribution } from "@theia/navigator/lib/browser/navigator-contribution";
import { ScmContribution } from "@theia/scm/lib/browser/scm-contribution";

// Theia calls initializeLayout only when no saved layout exists. So this
// default applies on the first start, and later manual changes stay.
@injectable()
export class ShellLayoutContribution implements FrontendApplicationContribution {
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(FileNavigatorContribution)
  protected readonly navigator!: FileNavigatorContribution;

  @inject(ScmContribution)
  protected readonly scm!: ScmContribution;

  async initializeLayout(): Promise<void> {
    await this.navigator.openView({ area: "left", reveal: true });

    // The SCM contribution opens its container on the left by default. The
    // container can already be attached there, so openView with a new area has
    // no effect. addWidget moves an attached widget to the new area.
    const scmContainer = await this.scm.widget;
    await this.shell.addWidget(scmContainer, { area: "right", rank: 100 });
    await this.shell.revealWidget(scmContainer.id);
  }
}
```

- [ ] **Step 8: Write the frontend module**

`extensions/shell-layout/src/browser/shell-layout-frontend-module.ts`:
```ts
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ContainerModule } from "@theia/core/shared/inversify";
import { DefaultPreferencesContribution } from "./default-preferences-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";

export default new ContainerModule((bind) => {
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ShellLayoutContribution);

  bind(DefaultPreferencesContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(DefaultPreferencesContribution);
});
```

- [ ] **Step 9: Add the extension to the application**

In `applications/electron/package.json`, add this line to `dependencies`, after the last `@theia/*` line:

```json
    "ai1-shell-layout": "0.1.0"
```

Run:
```bash
npm install
npm run build
```
Expected: no error. The webpack output contains no `ERROR`.

- [ ] **Step 10: Check the first-start layout by hand**

Theia keeps the saved layout in its user data folder. Start with an empty one so that `initializeLayout` runs:

Run: `THEIA_CONFIG_DIR="$(mktemp -d)" npm start`, then open the test folder from Task 2.

Expected:
1. The explorer is on the left.
2. The Source Control container is on the **right**, and it contains `WORKSPACE CHANGES` (spec criterion 3, complete).
3. `File > Preferences > Settings` shows `Editor: Format On Save` on and `Tab Size` 2.
4. A save of a TypeScript file that has a fixable ESLint problem fixes the problem (spec criterion 6).
5. Move the Source Control container to the left by hand, close the app, and start it again with the same `THEIA_CONFIG_DIR`. The container stays on the left. This proves that the default does not overrule the user.

If item 2 fails because the container stays on the left, the `initializeLayout` of `ScmContribution` ran after ours. In that case move the three SCM lines of `initializeLayout` into an `onDidInitializeLayout` method that first checks `this.shell.getAreaFor(scmContainer) === "left"` and a first-start flag in `StorageService` (`ai1.layoutInitialized`). Record the change in the commit body.

- [ ] **Step 11: Run the gates**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors, `6 passing`.

- [ ] **Step 12: Commit**

```bash
git add extensions/shell-layout applications/electron/package.json package-lock.json
git commit -m "Add the shell-layout extension" -m "On the first start the explorer opens on the left and the Source Control container, which holds the Workspace Changes view, opens on the right. The extension writes the default preferences to the user settings, but only the ones that the user did not set."
```

---

### Task 4: Packaging script

**Files:**
- Create: `applications/electron/electron-builder.yml`
- Create: `scripts/package-mac.sh`
- Modify: `applications/electron/package.json` (add `electron-builder`)

**Interfaces:**
- Consumes: root script `build:production` and `download:plugins`; the main script `scripts/ai1-electron-main.js`; the plugins folder.
- Produces: `applications/electron/dist/mac-arm64/AI1.app`, and with `--install` the app `/Applications/AI1.app`.

- [ ] **Step 1: Add electron-builder**

In `applications/electron/package.json`, add to `devDependencies`:
```json
    "electron-builder": "^26.0.0"
```

Run: `npm install`
Expected: no error.

- [ ] **Step 2: Create `applications/electron/electron-builder.yml`**

Theia bundles the back end with webpack into `lib/`, with the native modules in `lib/backend/native`. So the package does not need `node_modules`.

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
  - "!**/*.map"
mac:
  target:
    - target: dir
      arch:
        - arm64
  identity: null
  category: public.app-category.developer-tools
```

`identity: null` stops electron-builder from signing. The script signs ad-hoc in the next step. This prevents the use of a Developer ID certificate from a keychain.

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
Expected: the last line is `Packaged: applications/electron/dist/mac-arm64/AI1.app`. `codesign --verify` prints nothing and the script ends with exit code 0.

Run:
```bash
codesign -dv applications/electron/dist/mac-arm64/AI1.app 2>&1 | grep -E "Signature|Identifier"
ls applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app/plugins | wc -l
file applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1
```
Expected: `Signature=adhoc`. The plugin count is `17` (16 downloads plus `metarepo-sc`). The binary is `Mach-O 64-bit executable arm64`.

- [ ] **Step 5: Start the packaged app**

Run: `open applications/electron/dist/mac-arm64/AI1.app`
Expected: the app starts. Open the test folder from Task 2. The Workspace Changes view works, and autocomplete works in a `.ts` file. This proves that the packaged app finds its plugins and its native modules.

If the app starts but no extension loads, check that `Contents/Resources/app/scripts/ai1-electron-main.js` and `Contents/Resources/app/plugins` are siblings. If the app stops at start with a missing native module, add the reported folder to `files` in `electron-builder.yml`.

- [ ] **Step 6: Install**

Run: `scripts/package-mac.sh --install`
Expected: the last line is `Installed: /Applications/AI1.app`. The app starts from Launchpad (spec criterion 7).

- [ ] **Step 7: Run the gates and commit**

Run: `npm run lint && npm run format:check`
Expected: no errors.

```bash
git add applications/electron/electron-builder.yml applications/electron/package.json package-lock.json scripts/package-mac.sh
git commit -m "Add the macOS packaging script" -m "The script makes a production build for arm64 and signs it ad-hoc. It never uses automatic certificate discovery."
```

---

### Task 5: End-to-end smoke test

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`
- Create: `e2e/src/meta-repo-fixture.ts`
- Test: `e2e/src/m1-smoke.spec.ts`

**Interfaces:**
- Consumes: the development build in `applications/electron` and the plugins folder. The DOM ids `files` (explorer) and `scm-view-container` (SCM container). The view title `Workspace Changes`.
- Produces: root-level command `npm run test:e2e`. `createMetaRepoFixture(root: string): void`, which M2 and M3 tests use again.

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

Add to the root `package.json` scripts:
```json
    "test:e2e": "npm run test:e2e --workspace e2e",
```

Run: `npm install`
Expected: no error.

The test asks Playwright for its `browser` fixture, so Playwright needs its Chromium download even though the test drives Electron.

Run: `npx --workspace e2e playwright install chromium`
Expected: the download completes, or the log says that Chromium is already installed.

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

- [ ] **Step 3: Write the failing test**

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
  app = await TheiaAppLoader.load(
    { playwright, browser, useElectron: { electronAppPath, pluginsPath } },
    workspace,
  );
});

test.afterAll(async () => {
  await app.page.close();
});

test("the explorer is in the left panel", async () => {
  await expect(app.page.locator("div.theia-left-side-panel #files")).toBeVisible();
});

test("the source control container is in the right panel", async () => {
  await expect(app.page.locator("div.theia-right-side-panel #scm-view-container")).toBeVisible();
});

test("the Workspace Changes view lists only the dirty repository", async () => {
  const rightPanel = app.page.locator("div.theia-right-side-panel");
  await expect(rightPanel.getByText("Workspace Changes", { exact: false })).toBeVisible();
  await expect(rightPanel.getByText("dirty-repo")).toBeVisible();
  await expect(rightPanel.getByText("clean-repo")).toHaveCount(0);
});

test("a click on a changed file opens a diff in the center", async () => {
  const rightPanel = app.page.locator("div.theia-right-side-panel");
  await rightPanel.getByText("index.ts").first().click();
  await expect(app.page.locator("#theia-main-content-panel .monaco-diff-editor")).toBeVisible();
});
```

- [ ] **Step 4: Run the test without a build of the app to make sure that it fails**

Run:
```bash
mv applications/electron/lib applications/electron/lib.off
npm run test:e2e
mv applications/electron/lib.off applications/electron/lib
```
Expected: FAIL in `beforeAll`, because the Electron main module does not exist. This proves that the test starts the real app and does not pass without it.

- [ ] **Step 5: Run the test against the built app**

Run: `npm run build && npm run test:e2e`
Expected: PASS, `4 passed`.

If a locator fails, open the trace (`npx playwright show-trace e2e/test-results/<folder>/trace.zip`) and read the real DOM id or text. Correct the locator in the test. Do not change the application to fit the test. If the second test fails because the container is on the left, go back to the fallback of Task 3 Step 10.

- [ ] **Step 6: Run the gates and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: no errors.

```bash
git add e2e package.json package-lock.json
git commit -m "Add the M1 end-to-end smoke test" -m "The test starts the Electron app on a generated meta-repo with one clean and one dirty repository. It checks the panel positions, the Workspace Changes list, and the diff on click."
```

---

### Task 6: File watcher measurement and M1 close

**Files:**
- Create: `docs/m1-measurements.md`

**Interfaces:**
- Consumes: the installed app `/Applications/AI1.app` from Task 4.
- Produces: a recorded result that the M2 spec reads.

- [ ] **Step 1: Measure the load on a real meta-repo**

Start `/Applications/AI1.app` and open a real meta-repo folder with 20 or more sibling repositories that have `node_modules` installed. Wait 2 minutes with no input. Then run:

```bash
ps -axo rss,%cpu,command | grep -i "AI1.app" | grep -v grep | awk '{rss+=$1; cpu+=$2} END {printf "processes=%d rss_mb=%.0f cpu_percent=%.1f\n", NR, rss/1024, cpu}'
```

Then save one file in one repository and measure the time until the Workspace Changes view shows it.

- [ ] **Step 2: Record the result**

`docs/m1-measurements.md`, with the real numbers in place of each `<number>`:
```markdown
# M1 measurements

Date: <date of the measurement>
Workspace: a meta-repo with <number> sibling repositories, `node_modules` installed.

| Measurement | Result |
|---|---|
| Processes | <number> |
| Memory at idle (RSS, all processes) | <number> MB |
| CPU at idle, 2 minutes after start | <number> % |
| Time from save to the row in Workspace Changes | <number> s |

## Conclusion

<One of these two sentences.>
The idle load is acceptable. No change of the file watcher configuration is necessary.
The idle CPU is more than 5 %. The M2 spec must add `files.watcherExclude` defaults for `**/node_modules/**`, `**/dist/**`, and `**/lib/**`.
```

This file is a measurement record. The `<number>` marks are fields that the engineer fills with measured values in this step. The committed file contains no `<...>` mark.

- [ ] **Step 3: Check all eight M1 criteria of the spec**

| # | Criterion | Proof |
|---|---|---|
| 1 | Opens a meta-repo folder | Step 1 of this task |
| 2 | Material icons in the explorer | Task 2 Step 8 |
| 3 | Changes view on the right, dirty repositories only | Task 5, tests 2 and 3 |
| 4 | Click opens the diff in the center | Task 5, test 4 |
| 5 | Go-to-definition and autocomplete | Task 2 Step 8, again in the installed app |
| 6 | ESLint fix on save | Task 3 Step 10, again in the installed app |
| 7 | One script packages and installs | Task 4 Step 6 |
| 8 | Lint and type check pass | `npm run lint && npm run typecheck` |

Check criteria 5 and 6 one more time in the installed app, in a real TypeScript repository of the meta-repo.

- [ ] **Step 4: Commit and push**

```bash
git add docs/m1-measurements.md
git commit -m "Record the M1 file watcher measurements"
git push
```
