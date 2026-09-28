# AI1

AI1 means "All In 1". It is a personal desktop IDE for work with coding agents
across a meta-repo: one folder that contains many sibling git repositories.

The design is in `docs/superpowers/specs/`. The plans are in `docs/superpowers/plans/`.

## Requirements

- macOS on arm64
- Node 24 (`nvm use`)
- Xcode command line tools and Python 3

## Commands

| Command                            | Function                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `npm install`                      | Installs all workspaces                                   |
| `npm run download:plugins`         | Downloads the bundled VS Code extensions from Open VSX    |
| `npm run build`                    | Builds the extensions and the app in development mode     |
| `npm start`                        | Starts the app                                            |
| `npm run lint`                     | Runs ESLint                                               |
| `npm run typecheck`                | Runs the TypeScript type check                            |
| `npm test`                         | Runs the unit tests                                       |
| `scripts/package-mac.sh --install` | Makes the packaged app and installs it in `/Applications` |

Native modules must build with the system compiler:

    export CC=/usr/bin/cc CXX=/usr/bin/c++

## AI1 Browser

- **New tab:** run "Browser: New Tab" from the command palette. Type an address, for example `localhost:3000` or `example.com`.
- **Profiles:** each profile keeps its own logins, cookies, and storage. "Default" is yours. "Agent" starts with no logins. Change the profile of a tab in its toolbar. Add, rename, or delete profiles with "Browser: Manage Profiles".
- **Links:** the first ⌘-click on a web link asks where to open web links, and AI1 remembers the answer. Change it in the setting `ai1.browser.openLinksIn`. Hold Shift with the click to use the other browser one time.
- **Ports:** the Ports view in the right panel lists the servers that listen on your Mac, grouped by repository. Click a row to open it in a tab.
- **Agents:** set `ai1.browser.agentAddress.enabled` to `true`. Run "Browser: Copy Playwright MCP Config" and paste the result into the `mcp` section of your OpenCode config. Each agent that connects gets its own tab. There is no limit on the number of agents. A connected tab shows "Agent 1", "Agent 2", and so on, with a green dot. Click the toolbar button "Give this tab to the agent" to mark a tab for the next connection. The tab shows "Waiting for agent" until an agent connects. "Browser: Cancel Give to Agent" removes the mark. The copied config contains a secret: keep it private.
- **Find in page:** press ⌘F to open the find bar. Type a search text. Press ⌘G for the next match, and ⇧⌘G for the previous match. Press Esc to close the bar.
- **Zoom:** press ⌘+ (or ⌘=) to zoom in, ⌘- to zoom out, and ⌘0 to reset to 100%. AI1 remembers the level for each profile and host. When the level is not 100%, the toolbar shows a button with the level. Click it to reset.
- **Viewport sizes:** run "Browser: Set Viewport…", or click the device button in the toolbar, to show the page at a phone or tablet size (iPhone 15, Pixel 8, iPad Air, or iPad Pro 12.9), or at a custom size. Choose "Responsive (off)" to go back to the normal size. This menu is off while an agent is connected to the tab.
- **Downloads:** run "View: Toggle Downloads" to open the Downloads view in the right panel, next to Ports. Each row shows the file name, the host, and the progress or the size. Each row has the actions Cancel, Open, Show in Finder, and Remove from List. "Clear List" in the view toolbar removes the entries that are not in progress.
- **History:** run "Browser: Show History" to search the history of the current tab's profile by title or address. Press Enter to open the page in the current tab. Click the "Open in New Tab" item button to open it in a new tab instead. Run "Browser: Clear History…" to clear the history of the current profile.
- **Reopen Closed Tab:** press ⇧⌘T, or run "Browser: Reopen Closed Tab", to reopen the last browser tab that you closed, at its old position, with its profile and viewport size.
- **Updates:** AI1 checks for updates when it starts and every 24 hours. Run "AI1: Check for Updates" to check now. Select "Update Tools" to update OpenCode and tmux with Homebrew. AI1 and bundled extension updates need a manual build and install.
