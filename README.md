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

Rounded panels and terminal attention are in local development. See the
[terminal-attention guide](docs/terminal-attention.md) for opt-in hooks,
OpenCode session links, and current limits.

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
- Node 24 and npm 11 or later. The repo includes `.nvmrc` for NVM users.
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

npm 12 uses the reviewed dependency script list in `package.json`. Do not enable
all install scripts to fix a blocked dependency. The archive dependency override
requires npm 11 or later.
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

These keys use Command on macOS. Panel selection uses Control+Alt on Linux.
The tab and new-terminal bindings use Control on Linux.
Agents and Changes use Control+Shift+A and Control+Shift+C on Linux.
Linux behavior still needs native verification.

| macOS shortcut | Action                                                       |
| -------------- | ------------------------------------------------------------ |
| ⌘T             | Pick a repository and open a center terminal from any panel. |
| ⌘D / ⌘⇧D       | Split the focused terminal right / down.                     |
| ⌘⌃1–⌘⌃9        | Focus a numbered center panel.                               |
| ⌘1–⌘9          | Focus a numbered tab inside the current center panel.        |
| ⌘⌃0            | Return to the last focused center panel.                     |
| ⌘⇧E            | Open and focus Explorer.                                     |
| ⌘⌃A / ⌘⌃C      | Open and focus Agents / Changes.                             |
| ⌘⌃Enter        | Expand the focused terminal or file inside the center area.  |
| ⌘B             | Hide or show Explorer.                                       |
| ⌘F             | Find text in the focused terminal or browser.                |
| ⌘⌃B            | Open a new browser tab.                                      |
| ⌘⇧T            | Reopen a closed editor or browser tab.                       |
| ⌘P / ⌘⇧P       | Find a file / open the command palette.                      |
| ⌘⌥arrows       | Move between terminal panels (terminal focus only).          |
| ⌘⌃arrows       | Resize a terminal panel (terminal focus only).               |
| ⌘⇧Enter        | Toggle terminal zoom (terminal focus only).                  |
| Escape, Escape | Exit center zoom with two quick presses.                     |

Each visible split is a panel. Panel numbers go from left to right, then from
top to bottom. Hover a section icon to see its name and registered shortcut.
A four-panel grid uses 1 for top-left, 2 for top-right, 3 for
bottom-left, and 4 for bottom-right. Panel selection keeps its selected tab.
Tab numbers follow the tab order inside that panel. A missing panel or tab
causes no action. AI1 does not use Command+Shift+number for this navigation,
so the macOS screenshot shortcuts stay available.
The tab header stays visible during center zoom. Press Escape twice within
half a second, or press
Command+Control+Enter again to restore the split layout and panel sizes.
A single Escape stays with the focused control or terminal program. Menus,
search fields, and editor suggestions can use it. The second quick Escape
exits zoom instead of going to the terminal program.
Explorer, Agents, and Changes stay visible during center zoom.
On Linux, center zoom uses Control+Alt+Enter.
AI1 does not bind Command+Shift+W on macOS. Use the menu or the red close button
to close the window.
In Changes, Control-click a file row to open its diff in center zoom.
Control-click its Open File button to open the working file in center zoom.
In Agents, use the arrow keys to select a session. Press Enter to open a new
session terminal in the last focused center panel.
Right-click a session to rename it, open its terminal, or delete it with confirmation.
Control-click zoom is an extra action, not a requirement. Open a file or diff
normally, then use **View → Zoom Center Panel** or the zoom shortcut. A normal
right-click keeps the context menu. Control-click uses AI1's zoom action instead
of the macOS context menu in Changes.
Directional navigation stays terminal-only. Editors keep Cmd+Option+Up/Down
for multiple text cursors. AI1 does not capture Neovim's Control+W commands.

### Welcome tab and example workflow

**Welcome to AI1** opens on the first start of an app profile. It does not open
for each new repository. Use **Help → Welcome to AI1** to reopen it.
Set `ai1.welcome.startup` to `firstStart` (default), `always`, or `never`.
The tab shows the platform's shortcuts and this example workflow:

1. Open a workspace folder. Press **Cmd+T** and select a folder for a terminal.
2. Start your agent in the terminal. Or focus Agents with **Cmd+Control+A**,
   select an OpenCode session with the arrow keys, and press **Enter**.
3. Press **Cmd+D** to split the terminal right. Use **Cmd+Control+1/2** to
   select panels. Use **Cmd+1/2** to select tabs inside a panel.
4. Focus Changes with **Cmd+Control+C**. Click a file row for its diff, or
   use **Open File** for the working file.
5. Control-click either action to inspect that view in center zoom. Press
   **Escape twice** to restore the splits.
6. Press **Cmd+Control+0** to return to the last center panel. Press
   **Cmd+Control+B** to open the browser and test your local application.

Sessions opened from Agents run OpenCode inside a persistent shell in the
session directory. Control+C can exit OpenCode without closing the shell.
Selecting the same session again focuses its existing shell. It does not restart
OpenCode or interrupt another program. Session deletion and idle cleanup leave
these shells open. Persistent shells remain available after an app restart.

The new-terminal picker shows the workspace roots and all their direct child
folders. A folder does not need `.git`. Type a path such as `railgun/` to list
its subfolders. Continue with `railgun/re` to filter the list, or
`railgun/reloaded/` to list the next level. The picker shows **Browsing subfolders…**
while it reads a folder. Use **Browse…** for another path. Canceling either picker
opens no terminal.

Changes finds repositories at every folder level, including repositories inside
another repository. A group shows its workspace-relative path, such as
`railgun/reloaded/project`. Discovery skips `.git`, `node_modules`, `dist`,
`out`, `build`, and `coverage`. An explicitly opened workspace root is still
searched. Linked repositories remain supported. Discovery does not follow
linked container folders.

Use the **Changes settings** gear to set **Repository search depth** or
**Refresh mode**. Save a value for the **App profile** or **This workspace**.
A workspace value overrides the profile value. Select **Use app profile** to
remove that workspace override.

Depth `0` checks each workspace root itself. Depth `1` also checks its direct
children. **Custom depth…** accepts any non-negative whole number. **All levels**
is the default. The depth limits repository discovery, not files inside a
repository. The JSON preference is `ai1.changes.repositoryScanDepth`; `-1`
means all levels.

**Automatic** is the default refresh mode. Changes keeps its repository list
and checks only repositories affected by file events. File-event refresh pauses
while the view is hidden. **Manual** scans on workspace open and explicit actions,
not after file saves. Press **Refresh** for a full rescan, including newly added
repositories. A depth change also starts a full rescan. The JSON preference is
`ai1.changes.refreshMode`, with `automatic` and `manual` values.

Changes shows refresh progress, the last successful refresh time, and scan duration.
File events mark the result as possibly out of date until a scan succeeds.
A failed refresh keeps the last successful tree and shows an error.
To measure discovery and cached updates without changing files, build the Changes
extension and run `node scripts/benchmark-changes.mjs <workspace-folder> [depth]`.

Agent attention uses a thin blue border for working, amber for input, green for completion, and red for
supported failures. Hook setup is opt-in. See [terminal attention](docs/terminal-attention.md)
for setup and signal limits. AI1 does not change global agent settings.

Terminal defaults use the Ghostty 0x96f palette, a Nerd Font with system
fallbacks, 13-pixel text, and a block cursor. AI1 does not install fonts or read
Ghostty settings at runtime. Use normal terminal font preferences to adjust the
text size. `ai1.terminal.appearance` selects `ghostty` or the editor `theme`.
Use **Terminal: Appearance…** or the terminal toolbar gear to change font size,
font family, text weights, bold ANSI colors, and palette. These controls save to
the app profile. Restore terminal defaults removes only app-profile appearance
overrides. Workspace overrides stay in effect. Custom color overrides stay in
effect after a palette change.

On macOS, **Cmd+K, Cmd+W** closes all center tabs as one batch.
**Cmd+Shift+T** restores that batch, including editors, browser tabs, and
persistent terminals. The original tab order and split groups return if no new
tabs are open. New tabs stay open if you create them before restore. Persistent
terminals reconnect to their existing shells. Closed batches stay in memory
until app exit. On other platforms, use **Ctrl** instead of **Cmd**.
**Cmd+K** now starts the close chord in terminals. Use **Terminal: Clear** in
the command palette to clear a terminal.

The Ghostty palette does not make terminal text rendering identical. AI1 uses
xterm.js with WebGL. Ghostty uses a different renderer. Font size and bold-color
preferences also affect the result. AI1 uses normal font weight for ordinary
text. Use `terminal.integrated.fontSize`, `terminal.integrated.fontWeight`,
`terminal.integrated.fontWeightBold`, and
`terminal.integrated.drawBoldTextInBrightColors` to adjust the text.

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
