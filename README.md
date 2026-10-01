<picture>
  <source media="(prefers-color-scheme: dark)" srcset="applications/electron/resources/branding/icon-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="applications/electron/resources/branding/icon-light.png">
  <img alt="AI1" src="applications/electron/resources/branding/icon-light.png" width="96">
</picture>

# AI1 — All In 1

**One desktop workspace for code, terminals, coding agents, and the browser.**

AI1 is an IDE for a folder that contains several Git repositories. Keep the
editor, repository changes, persistent shells, OpenCode sessions, and browser
tabs in one window. AI1 uses [Eclipse Theia](https://theia-ide.org/).

[Build on macOS](#build-on-macos) · [Try Omarchy](#try-omarchy-with-your-llm) ·
[Platform status](#platform-status) · [License](#license)

> **Development preview.** No ready-to-use release is available. Native Linux
> support is not verified. Known critical dependency findings remain open.
> Read the [release review](docs/public-release-review.md) before building or
> installing extensions. Do not treat this app as a hardened browser or IDE.

## What you can do

- **Work across repositories.** Browse files with Material icons and see changed
  files grouped by repository. Open a diff without switching projects.
- **Edit code.** Use TypeScript IntelliSense, ESLint, and bundled language
  extensions. Open SVG, PNG, and other common images in preview tabs.
- **Keep shells running.** Persistent terminals use tmux. Split the center area,
  resize panes, and restore the terminal layout when the app opens again.
- **Manage coding agents.** View OpenCode v2 sessions, open their terminals,
  rename sessions, and respond to requests for approval.
- **Test in the browser.** Use separate login profiles, local port links,
  responsive viewports, downloads, and history. An optional Playwright MCP
  connection gives an agent its own browser tab.

## Platform status

| Platform                           | Current state                                                 |
| ---------------------------------- | ------------------------------------------------------------- |
| macOS, Apple Silicon               | Local builds and Electron tests pass. Build from source.      |
| Omarchy, Linux x64                 | Experimental source-build flow. No native runtime test yet.   |
| Ubuntu under WSL2/WSLg, x64        | Build preparation only. No verified Linux package or runtime. |
| Native Windows and other platforms | No verified build or installation flow.                       |

There are no published app downloads. A successful Linux build alone does not
prove Wayland, sandbox, terminal, or keyring support.

## Build on macOS

### Prerequisites

- An Apple Silicon Mac.
- Node 24 and npm. The repo includes `.nvmrc` for NVM users.
- Xcode command line tools and Python 3 for native dependencies.
- Git, tmux, and OpenCode **v2** for agent and persistent-terminal features.

AI1 does not install these tools for you. OpenCode v1 is not a replacement for
v2. Review dependency install scripts before running them.

### Get the source and start the app

The first two commands create a checkout and enter it. Use another folder name
if `ai1` already exists. The next command selects the system compiler for native
modules. `npm ci` installs the locked dependencies. The remaining commands
download the pinned extensions, build the app, and start it:

```sh
git clone https://github.com/mattgle/ai1.git
cd ai1
export CC=/usr/bin/cc CXX=/usr/bin/c++
npm ci
npm run download:plugins
npm run build:production
npm start
```

If you use NVM, run `nvm use` in the checkout before `npm ci`.
Open a workspace folder that contains your repositories after the app starts.

### Make a local app bundle

This command builds and signs a local test app. It does not install it:

```sh
bash scripts/package-mac.sh
```

The output is `applications/electron/dist/mac-arm64/AI1.app`. The signature is
local, not an Apple Developer ID signature. The app is not notarized.

**Optional installation:** `bash scripts/package-mac.sh --install` replaces
`/Applications/AI1.app`. Back up an existing copy and quit it before using that
option. Source builds remain the current macOS distribution method.

## Try Omarchy with your LLM

Paste the text below into an LLM that can read files and run commands on your
machine. The current flow ends at an **experimental source build**, not a
supported installation. You still approve system changes and the build.

```text
Help me build AI1 from https://github.com/mattgle/ai1 on this Omarchy machine.
Read README.md, docs/omarchy-setup.md, and scripts/setup-linux.sh first.
Inspect the distribution, CPU, user, Node/npm paths, and build prerequisites.
Use a fresh checkout under my Linux home directory. Ask before choosing its path.
Do not overwrite existing files or change system packages without my approval.
Explain each command before you run it.

Run bash scripts/setup-linux.sh --check before building.
If checks fail, explain the missing requirements and stop.
After I approve the build, run bash scripts/setup-linux.sh --build.
Do not change dependency pins, disable the sandbox, or use real app data for tests.
Do not claim Omarchy support from a successful build alone.
Report the output directory and the pending runtime checks.
```

For manual setup, see the [Omarchy guide](docs/omarchy-setup.md). The script does
not use `sudo`, install system packages, change Hyprland settings, or add a
launcher. Use a fresh checkout; it preserves existing `node_modules` directories.

For Ubuntu inside Windows, use the separate [WSL guide](docs/wsl-setup.md).
Omarchy uses Arch packages, not Ubuntu `apt` commands or `.deb` packages.

## Everyday controls

These keys use Command on macOS. The row, column, and new-terminal bindings use
Control on Linux, but Linux behavior still needs native verification.

| macOS shortcut | Action                                                       |
| -------------- | ------------------------------------------------------------ |
| ⌘T             | Pick a repository and open a center terminal from any panel. |
| ⌘D / ⌘⇧D       | Split the focused terminal right / down.                     |
| ⌘⇧1 / ⌘⇧2      | Focus the first / second center row.                         |
| ⌘1 / ⌘2        | Focus the first / second pane in the current row.            |
| ⌘B             | Hide or show Explorer.                                       |
| ⌘F             | Find text in the focused terminal or browser.                |

Row and column shortcuts select panes, not tabs. A missing row or column causes
no action. Right-click a session to rename it, open its terminal, or delete it
with confirmation.

Terminal defaults use the Ghostty 0x96f palette, a Nerd Font with system
fallbacks, 12-pixel text, and a block cursor. AI1 does not install fonts or read
Ghostty settings at runtime. Use normal terminal font preferences to adjust the
text size. `ai1.terminal.appearance` selects `ghostty` or the editor `theme`.

## Browser and agent setup

- Run **Browser: New Tab** from the command palette to open an address.
- Use **Browser: Manage Profiles** to keep separate logins and storage.
  The Agent profile starts with no logins.
- Open the **Ports** view to find local servers by repository.
- For Playwright MCP, enable `ai1.browser.agentAddress.enabled`. Run
  **Browser: Copy Playwright MCP Config** and add the result to your OpenCode
  config. The copied config contains a secret. Do not share or commit it.
- Use **Give this tab to the agent** to offer a browser tab to the next agent
  connection. Use **Browser: Cancel Give to Agent** to cancel the offer.
- Use **Browser: Set Viewport…**, **Browser: Show History**, and
  **View: Toggle Downloads** for page testing and browser history.

Each connected browser agent gets its own tab. On macOS, web links support
Command-click, browser find uses ⌘F/⌘G, and browser zoom uses ⌘+/⌘−/⌘0.
External cookie import and automatic tool updates are not available on Linux.
AI1 does not silently build or install its own updates.

## Development

| Command                       | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `npm ci`                      | Install locked project dependencies.                    |
| `npm run download:plugins`    | Download pinned extensions from Open VSX.               |
| `npm run build:production`    | Build the extensions and Electron app.                  |
| `npm start`                   | Start the development app.                              |
| `npm test`                    | Run workspace unit tests.                               |
| `npm run test:release-checks` | Test setup and release-check scripts.                   |
| `npm run test:e2e`            | Run Electron checks. macOS validation uses this suite.  |
| `npm run lint`                | Run ESLint.                                             |
| `npm run typecheck`           | Check TypeScript types.                                 |
| `npm run format:check`        | Check formatting.                                       |
| `npm run scan:secrets`        | Scan local Git history and source with Gitleaks 8.30.1. |

The secret scan requires an installed Gitleaks or a `GITLEAKS_BIN` path. It does
not install a scanner. Reports use full redaction and stay outside the repo.

### Project layout

```text
applications/electron/  Electron app, build configuration, and branding
extensions/            Theia modules for agents, browser, changes, and layout
e2e/                   Isolated Electron test fixtures
scripts/               Build, source setup, and release checks
docs/                  Product specifications, setup guides, and review records
```

Theia packages and bundled extensions use pinned versions. Keep framework
versions aligned. Do not use `npm audit fix --force` to resolve release findings.

For bugs, include the OS, CPU, Node/npm versions, build command, and reproduction
steps. Remove credentials, browser data, and private project paths from logs.
Do not post secrets or sensitive vulnerability details in a public issue.

## License

AI1's own code uses the [MIT license](LICENSE). Theia, Electron, bundled
extensions, icons, and other dependencies keep their own licenses and notices.
See the [release review](docs/public-release-review.md) for the current license
and security checks. Binary distribution notice review remains incomplete.
