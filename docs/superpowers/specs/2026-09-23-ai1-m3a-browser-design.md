# AI1 M3a design: browser core

Date: 2026-09-23
Status: approved design, before the M3a implementation plan

M3a adds a browser to AI1, like the browser of Orca. It replaces the M3 section
of the M1 design (`2026-09-21-ai1-design.md`). It also replaces the M1 line
that puts "general browsing with logins" out of scope: M3a has login profiles.
M3 has two parts. M3a is the browser core. M3b adds the other features (see
"Not in M3a").

## Goal

- A browser tab in the main area, on demand, at the same level as a terminal
  tab. It can split, and there can be several tabs. It opens any address,
  also a local dev server.
- Separate profiles. Each profile keeps its own logins, cookies, and storage.
- A ⌘-click on a web link asks one time: "AI1 Browser" or "System Browser".
- A Ports panel that lists the servers that listen on the Mac, grouped by
  repository.
- The owner's agents control one AI1 browser tab with Playwright MCP, the same
  tools they use now. They cannot control the other tabs or the IDE window.

## Decisions and their reasons

- **The page is an Electron `<webview>` element in a Theia widget.** Orca uses
  it. It is plain DOM, so it follows splits, tab moves, and hidden tabs, and
  Theia menus, dialogs, and hovers draw above it. A `WebContentsView` always
  draws above all HTML, so each Theia overlay would need a workaround, and its
  bounds must follow the widget through IPC.
- **Agents use Playwright MCP through a local address that shows one tab.**
  The owner's agents already use Playwright. AI1 contains no browser
  automation tools. It only gives the tab to the tool. Orca's
  `agent-browser` command line was not chosen: it is a new way for the agents
  to work and a large port (about 7,500 lines, closely tied to Orca).
- **The agent address is off by default and has a secret part.** Orca's proxy
  has no password. Without a secret, each program on the Mac could control the
  agent tab, which can have logins.
- **Profiles are Electron session partitions.** This is the standard Electron
  way to keep sessions apart. Orca does the same.
- **The cookie import from Chrome is in M3b.** It needs Keychain access,
  decryption, and about 5,000 lines in Orca. In M3a the owner logs in inside
  the AI1 tab, and the login stays in that profile.
- **Code from Orca is ported where it fits.** Orca is MIT licensed
  (Lovecast Inc.). Each ported file keeps the notice. The main-process parts
  port with small changes. The React UI of Orca is not ported: AI1 uses Theia
  widgets.
- **The ⌘-click rule applies to every web link that AI1 opens.** One rule in
  all places (terminal, editor, Markdown preview). The side effect: Theia's
  own help links also follow the choice.

## Verified facts

From a read of Theia 1.75.0, Electron 42.8.1, and Orca (the owner's fork at
`~/code/orca`) on 2026-09-23.

- **The `<webview>` tag is off in the AI1 window.** `getDefaultOptions()` in
  `@theia/core/src/electron-main/electron-main-application.ts` does not set
  `webviewTag`, and the Electron default is `false`. The
  `electron.windowOptions` config replaces the full `webPreferences` object,
  so it cannot add one key. A contribution's `onStart` is too late. The way
  to change it is a subclass of `ElectronMainApplication`, bound with
  `rebind` in the `electronMain` module of the extension.
- **Theia blocks navigation in every web contents.** `onWebContentsCreated`
  (through `app.on('web-contents-created')`) cancels each `will-navigate`, and
  its `setWindowOpenHandler` sends each popup to the system browser. This also
  applies to a `<webview>` guest. So links, form posts, and logins do not work
  in the tab until AI1 handles its own guests in a different way.
- **Theia itself uses no `<webview>` and no `WebContentsView`.** The plugin
  webview is a sandboxed iframe.
- **`@theia/mini-browser` is not suitable.** It shows the page in an iframe.
  Many sites refuse frames (`X-Frame-Options`, CSP `frame-ancestors`), cookies
  in a frame are third-party, and it has no profiles.
- **Terminal links go through Theia's open handlers.** `UrlLinkProvider`
  (`@theia/terminal/src/browser/terminal-url-link-provider.ts`) calls
  `open(openerService, uri)`. The default handler for http(s) is
  `HttpOpenHandler` (`@theia/core/src/browser/http-open-handler.ts`, priority
  500), which calls `shell.openExternal` in the end. A handler with a higher
  priority takes all http(s) links.
- **An extension can add its own preload API.** `@theia/filesystem` does it:
  `"preload"` in `theiaExtensions`, `contextBridge.exposeInMainWorld` in the
  preload, and `ipcMain.handle` in an `ElectronMainApplicationContribution`.
- **Orca embeds a `<webview>` and never moves it in the DOM.** A guest reloads
  when its parent element changes. Orca keeps each webview in a registry and
  moves only its position.
- **Orca's page security** (`src/main/window/main-window-webview-security.ts`):
  in `will-attach-webview` it fails closed unless the address is http(s) or
  file and the partition is in its allowlist. It removes the preload and
  forces `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`,
  `webSecurity: true`.
- **Orca's one-tab CDP proxy** (`src/main/browser/cdp-ws-proxy.ts` and about
  ten small helpers, about 1,570 lines, dependencies `electron` and `ws`):
  - It attaches `webContents.debugger` of one tab.
  - It serves a WebSocket on `127.0.0.1` and answers the browser-level
    requests (`/json/version`, `/json/list`, `Target.*`, `Browser.getVersion`)
    itself, with exactly one target.
  - It sends every other command to that tab's debugger.
  - It has special handling for `Page.navigate`, `Page.reload`,
    `Page.captureScreenshot` (a raw call hangs on a webview guest), and
    `Page.printToPDF`.
  - It does not handle `Target.createTarget`.
  - The debugger attach fails when DevTools is open on the tab.
- **Orca's port scan** (`src/main/ports/`): `lsof -nP -iTCP -sTCP:LISTEN -F pcn`
  on macOS, a 4 s timeout, and a match to a folder by the process's working
  folder.

## Architecture

A new extension, `extensions/browser-pane`, with four parts.

### Main process (`src/electron-main`)

- **`Ai1ElectronMainApplication`**, a subclass of `ElectronMainApplication`,
  bound with `rebind`:
  - `getDefaultOptions()` adds `webviewTag: true`.
  - `onWebContentsCreated` keeps Theia's navigation block for every web
    contents except AI1 browser guests. A guest is a web contents of type
    `webview` whose session is an AI1 profile partition.
- **Page security**, ported from Orca, in `will-attach-webview`:
  - Fails closed unless the address is `http:`, `https:`, or `about:blank`,
    and the partition is an AI1 profile partition.
  - Removes the preload, and forces `nodeIntegration: false`,
    `nodeIntegrationInSubFrames: false`, `contextIsolation: true`,
    `sandbox: true`, `webSecurity: true`,
    `allowRunningInsecureContent: false`.
- **Guest policies**, applied in `did-attach-webview`:
  - Background throttling off.
  - Popups: a popup that needs its opener (a login popup) opens as a small
    AI1 window with the same profile. Other popups open as a new AI1 tab.
  - Permissions: an allowlist (fullscreen, clipboard read and sanitized write,
    notifications, persistent storage, pointer lock, storage access). Camera
    and microphone go to the macOS permission prompt. All other requests are
    refused.
  - Downloads go to `~/Downloads`, with a notification.
  - Certificate errors: refused. For `localhost` and `127.0.0.1` only, the tab
    can accept the certificate until AI1 closes.
- **Profile registry.** A profile has an id, a name, and a partition
  `persist:ai1-browser-<id>`. The list is saved in a JSON file in Electron's
  user data folder. It starts with two profiles: "Default" (id `default`,
  for the owner) and "Agent" (id `agent`, no logins). The owner can add,
  rename, and delete profiles. A delete also clears the storage of that
  partition.
- **Agent address** (see its own section).

### Front end (`src/browser`)

- **`BrowserWidget`**: a Theia widget in the main area. It holds one
  `<webview>` and a toolbar: address bar, back, forward, reload, the profile
  of the tab, "Give to agent", and DevTools.
  - The `<webview>` element is made once and never moves to a new parent
    element. A hidden tab hides it with CSS.
  - The widget saves its address and profile, so the tab comes back after a
    restart.
- **Commands:** "Browser: New Tab", "Browser: New Tab in Profile…",
  "Browser: Manage Profiles", "Browser: Copy Playwright MCP Config".
- **`BrowserOpenHandler`**: an open handler for http(s) with a priority above
  500 (see "Links").
- **Ports view** in the right panel, next to Agents and Changes (see "Ports").

### Back end (`src/node`)

- **`PortsService`**: runs the port scan and matches ports to repositories.
  It is a per-connection service, bound with `bindBackendService`, the same as
  the Agents service of M2.

### Link between the parts

- A preload API, `electronAi1Browser`, and `ipcMain.handle` channels in the
  main process, the same pattern as `@theia/filesystem`. The front end uses it
  to register a guest's web contents id, to read and change profiles, to set
  the agent tab, and to receive the agent state.

## Profiles

- New tabs use "Default". "Browser: New Tab in Profile…" and the profile menu
  in the toolbar choose another one. A change of profile loads the tab again
  in the new partition.
- A cookie, a login, or storage in one profile is not visible in another
  profile.

## Agent address

- **Settings:**
  - `ai1.browser.agentAddress.enabled`, default `false`.
  - `ai1.browser.agentAddress.port`, default `9333`.
- **The secret.** AI1 makes a random secret one time (32 bytes, base64url) and
  saves it in the user data folder, not in `settings.json`. The address is
  `http://127.0.0.1:<port>/<secret>/`. A request without the right secret gets
  `404` and no data.
- **"Browser: Copy Playwright MCP Config"** puts the full OpenCode MCP config
  entry, with `--cdp-endpoint` and this address, on the clipboard.
- **Which tab.** A window has at most one agent tab. It shows an "Agent" mark,
  and the mark lights up while an agent is connected.
  - When Playwright connects and there is no agent tab, AI1 opens a new tab in
    the "Agent" profile and makes it the agent tab.
  - "Give to agent" makes the current tab the agent tab. Only one tab is the
    agent tab.
  - With more than one AI1 window, the address uses the agent tab of the
    window that had the focus last.
  - When the agent tab closes, the connection ends. The next connection gets a
    new tab.
- **One client at a time.** A new connection replaces the old one, the same as
  Orca.
- **What the agent can do.** Everything that the Chrome DevTools Protocol
  allows on that one page, and navigation to any address. It cannot see other
  tabs, other profiles, or the IDE window.
- **The proxy** is Orca's `cdp-ws-proxy.ts` and its helpers, with the secret
  check added, and the tab selection above in place of Orca's worktree
  selection.
- **Open point, settled by the first task of the plan.** Playwright can ask
  for a new page (`Target.createTarget`). A short test with the real
  Playwright MCP decides the answer: give the agent tab again, or open a new
  agent tab.

## Ports

- The back end runs `lsof -nP -iTCP -sTCP:LISTEN -F pcn` with a 4 s timeout,
  and reads the working folder of each process with `lsof -a -p <pid> -d cwd
  -Fn`.
- A port belongs to a repository when the process's working folder is in that
  repository. Ports that are not in the workspace go to a closed group,
  "Other".
- A row shows the port, the program name, and the repository. A click opens
  `http://localhost:<port>` in a new AI1 tab. The context menu has
  "Open in System Browser" and "Copy Address".
- The Ports tab shows the number of workspace servers as a badge.
- The scan runs every 5 seconds while the view is visible, and at once on a
  click on the refresh button. It does not run while the view is hidden.

## Links

- Setting `ai1.browser.openLinksIn`: `ask` (default), `ai1`, or `system`.
- With `ask`, the first http(s) link asks "Open links in: AI1 Browser /
  System Browser", and saves the answer in the setting.
- Shift with the click opens the other browser, for that click only.
- In the AI1 browser, a link opens in a new tab in "Default", next to the
  current tab.

## Error behavior

| Case | Behavior |
|---|---|
| The page does not load (for example, the dev server stopped) | The tab shows the error in plain words and a Retry button. |
| The page process crashes | The tab shows a message and a Reload button. The rest of AI1 continues. |
| Certificate error on a real site | The page is blocked, with a message. |
| Certificate error on `localhost` or `127.0.0.1` | The page is blocked, with a "Continue anyway" button that accepts the certificate until AI1 closes. |
| The agent port is in use | A notification tells the owner to choose another port in the settings. |
| DevTools is open on the agent tab when an agent connects | The connection is refused, and a notification tells why. |
| The agent disconnects | The "Agent" mark goes off. |
| `lsof` fails or takes more than 4 s | The Ports view shows the error and a Retry button. |
| A `will-attach-webview` check fails | The page does not load, and the tab shows why. |

## Tests

The same method as M2: a failing test first, then the code. Pure logic is in
`src/common`, and plain Node mocha tests it.

- **Unit tests:**
  - address check and normalization;
  - the profile partition allowlist;
  - the forced page settings of `will-attach-webview`, as a pure function on
    `webPreferences`;
  - the permission allowlist;
  - the one-target answers of the fake browser (`/json/version`, `/json/list`,
    `Target.*`);
  - the secret check of the agent address;
  - the `lsof` output parser and the port-to-repository match;
  - the link rule (setting and Shift).
- **e2e tests**, always in the hidden mode (`AI1_E2E_BACKGROUND=1`). The
  hidden mode also covers the browser guests: background throttling is off
  for them too.
  - A local test server gives all pages. No real site is used.
  - A form post and a redirect work in a tab, which proves that the
    navigation block is off for AI1 guests.
  - A cookie set in "Default" is not visible in "Agent".
  - A ⌘-click on a link in a terminal shows the question and opens the tab.
  - The Ports view lists the test server under its repository.
  - Real Playwright (`chromium.connectOverCDP`) connects to the agent
    address, clicks a button in the agent tab, and sees only that page. A
    wrong secret is refused.
- **First task: a spike** with the real Playwright MCP against a small proxy,
  to settle the answer to `Target.createTarget`. The spike code is not kept.

## M3a is complete when

- A browser tab opens on demand, splits, and comes back after a restart.
- Links, form posts, redirects, and logins work in the tab.
- Profiles keep their sessions apart, and the owner can add, rename, and
  delete them.
- ⌘-click on a link follows the one-time choice, and Shift inverts it.
- The Ports view lists the workspace servers by repository and opens them.
- The owner's agents control the agent tab through Playwright MCP, and only
  that tab.
- All gates pass: format, lint, typecheck, unit tests, build, and e2e in the
  hidden mode.

## Not in M3a

These go to M3b: the cookie import from Chrome, Arc, and Brave; Design Mode;
annotations and comments; viewport sizes; find in page; the downloads list;
history and "reopen closed tab"; zoom controls; a "Stop server" action in the
Ports view; one tab for each agent.
