# AI1 M3b part A: Many Agents and Browser Basics — Design

**Status:** approved in chat on 2026-09-25.
**Extends:** `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md`. This
document replaces the M3a rules "one client at a time" and "the window that had
the focus last uses its agent tab". All other M3a rules stay.

## Goal

- More than one agent can use the AI1 browser at the same time. Each agent has
  its own tab.
- The browser gets the basic functions of a normal browser: find in page, zoom,
  a downloads list, history, "reopen closed tab", and phone and tablet sizes.

## Scope

In scope: the six functions below, and the keyboard shortcuts that they need.

Out of scope:
- Resuming a download after a restart.
- Restoring the back and forward list of a tab that opens again.
- Agent names in the agent address.
- Saved custom viewport presets. "Custom…" applies to the current tab only.
- M3b part B (Design Mode and annotations) and part C (cookie import).

## 1. Many agents

### Behavior

- Each new connection to the agent address gets its own agent tab. There is no
  limit on the number of connections.
- The tab for a new connection:
  1. If a tab has the "Waiting for agent" mark and is open, the connection takes
     that tab. The mark goes off.
  2. If not, the AI1 window that had the focus last opens a new tab in the
     "Agent" profile. The tab opens in the background and does not take the
     focus.
- "Give to agent" puts the "Waiting for agent" mark on the current tab. At most
  one tab in all windows has this mark. When the owner gives a second tab, the
  first tab loses the mark. "Browser: Cancel Give to Agent" removes the mark.
- When a connection ends, its tab stays open as a normal tab, and the "Agent"
  mark goes off. No connection can take this tab again, unless the owner gives
  it again.
- When the owner closes an agent tab, only the connection of that tab ends.
- Each agent sees only its own page, as in M3a. `Target.createTarget` stays
  refused, so each agent has one page.
- Tab marks: "Agent" (lit while connected) and "Waiting for agent". The title of
  an agent tab shows a short number ("Agent 2"), so that the owner can tell the
  agent tabs apart. The numbers start at 1 when AI1 starts.

### Code

- `AgentProxies`: remove the rule that stops the other clients. Each guest has
  its own proxy with at most one client.
- `AgentTabs`: replace the map "window → agent tab" with a map "connection →
  guest" and one waiting tab. `resolve()` uses the waiting tab first. If there
  is none, it asks for a new tab.
- The agent state message to the front end becomes a list of entries:
  `{ tabId, state: "waiting" | "connected", number? }`. A tab that is not in the
  list is a normal tab.

### Errors

| Case | Behavior |
|---|---|
| DevTools is open on the waiting tab when an agent connects | The connection is refused with a notification, as in M3a. The mark stays. |
| No AI1 window is open | The connection is refused, as in M3a. |

## 2. Keyboard shortcuts

- When a page in a `<webview>` has the focus, its key events do not go to the
  Theia keybinding service. So the main process catches a fixed list of
  shortcuts with `before-input-event` on each AI1 page, stops them
  (`preventDefault`), and sends them to the window of that tab.
- The list: ⌘F, ⌘G, ⇧⌘G, Esc (only while the find bar is open), ⌘+ (also ⌘=),
  ⌘-, ⌘0, ⇧⌘T, ⌘L.
- The front end registers the same shortcuts as Theia keybindings, active when a
  browser tab has the focus. They work when the focus is on the toolbar.
- On a tab with a connected agent, the main process catches no keys. The page
  gets all keys unchanged, so the agent's input is never stopped.
- The list is a pure function in `src/common` (key input → command id or
  nothing).

## 3. Find in page

- ⌘F opens a find bar below the toolbar. The bar has a text field, a count
  ("3 of 12", or "No results"), Previous, Next, and Close.
- It uses `webContents.findInPage` and the `found-in-page` event, through the
  preload API.
- Enter goes to the next match. ⇧Enter goes to the previous match. ⌘G and ⇧⌘G do
  the same while the bar is open. Esc closes the bar and clears the marks
  (`stopFindInPage("clearSelection")`).
- A navigation of the main frame closes the bar.

## 4. Zoom

- ⌘+ and ⌘- go through the Chrome zoom steps: 25, 33, 50, 67, 75, 80, 90, 100,
  110, 125, 150, 175, 200, 250, 300, 400, and 500 percent. ⌘0 sets 100%.
- A `ZoomStore` in the main process (`ai1-browser-zoom.json` in the user data
  folder) keeps the level for each profile and host (`host:port`). A level of
  100% is removed from the file.
- A tab sets the saved level when it goes to a host. A change applies to all
  open tabs with the same profile and host, in all windows.
- When the level is not 100%, the toolbar shows a button with the level
  ("110%"). A click sets 100%.
- The "Agent" profile has its own levels, the same as any profile.

## 5. Viewport sizes

- A toolbar menu has:
  - "Responsive (off)";
  - iPhone 15 (393 × 852, ratio 3);
  - Pixel 8 (412 × 915, ratio 2.625);
  - iPad Air (820 × 1180, ratio 2);
  - iPad Pro 12.9 (1024 × 1366, ratio 2);
  - "Custom…" (width and height, each 200 to 4000);
  - "Rotate", which swaps the width and height.
- The phone and tablet presets are mobile, with touch, and with a mobile user
  agent string for the device. "Custom…" is not mobile and has no touch.
- AI1 attaches its own debugger to the tab and sends:
  - `Emulation.setDeviceMetricsOverride`;
  - `Emulation.setTouchEmulationEnabled`;
  - `Emulation.setUserAgentOverride`.
- The page then loads again, so it sees the new user agent. The tab shows the
  page in the center on a gray background, with a label such as "393 × 852".
- The choice is saved with the tab layout and set again after a restart.
- "Responsive (off)" clears the emulation and detaches the debugger of AI1.
- **Agent handover.** Before an agent connects to a tab, AI1 clears the
  emulation and detaches its debugger. While the agent is connected, the menu is
  off. When the agent disconnects, the menu works again, with "Responsive (off)".
- If DevTools is open on the tab, the menu shows "Close DevTools to use
  viewport sizes." Electron allows one debugger for each page.
- The presets and the check of "Custom…" values are pure functions in
  `src/common`.

## 6. Downloads

- A `DownloadStore` in the main process (`ai1-browser-downloads.json` in the
  user data folder) keeps the last 100 downloads. Each entry has an id, the file
  name, the full path, the address, the profile, the total and received bytes,
  the start time, and a state:
  - in progress;
  - done;
  - cancelled;
  - failed;
  - deleted.
- Files go to the Downloads folder with a unique name, as in M3a.
- Progress goes to all windows at most 2 times each second for each download.
  State changes go at once.
- A "Downloads" view in the right panel, next to Ports:
  - A row shows the file name, the host, and a progress bar, or the size and the
    date.
  - Row actions: Cancel (while it runs), Open, Show in Finder, and Remove from
    List. The view toolbar has "Clear List", which removes all entries that are
    not in progress.
  - The tab badge shows the number of downloads in progress.
- The notice when a download is done stays. It gets a "Show in Finder" action.
- When the view opens, an entry whose file is gone shows "Deleted", and Open is
  off.
- Downloads from agent tabs are in the list with an "Agent" label. AI1 never
  opens a downloaded file by itself. Open is always a click of the owner.
- When the store loads, an entry "in progress" becomes "failed" with the text
  "AI1 closed during the download."
- Open and Show in Finder go through one small wrapper of `shell.openPath` and
  `shell.showItemInFolder`, so that e2e tests can stub it.

## 7. History

- A `HistoryStore` in the main process keeps one JSON file for each profile
  (`ai1-browser-history/<profile id>.json` in the user data folder). An entry
  has the address, the title, and the time of the visit.
- It records `did-navigate` and `did-navigate-in-page` of the main frame, only
  for `http:` and `https:`. `page-title-updated` updates the title of the last
  entry of that page.
- A visit to the same address within 1 minute updates the last entry and does
  not add a new entry.
- The store keeps 90 days and at most 10,000 entries for each profile. It writes
  at most once in 5 seconds, and once at quit.
- Not recorded: the "Agent" profile, and any tab while an agent is connected to
  it.
- "Browser: Show History" opens a quick pick with the history of the profile of
  the current browser tab (or "Default" when no browser tab has the focus). It
  shows the newest entries first and searches the title and the address. Each
  item shows the title, the address, and a label: "Today", "Yesterday", or the
  date. Enter opens the page in the current browser tab, or in a new tab when no
  browser tab has the focus. ⌘Enter opens it in a new tab.
- "Browser: Clear History…" asks the owner to confirm, then clears the history
  of the profile of the current tab. When the owner deletes a profile, its
  history file is also deleted.

## 8. Reopen closed tab

- Each window keeps its last 20 closed browser tabs in memory: the address, the
  profile, the viewport choice, and the position in the tab bar.
- ⇧⌘T and "Browser: Reopen Closed Tab" open the last one at its old position,
  with its profile and viewport.
- A tab that closes while an agent is connected to it is not in the list.
- The list does not stay after a restart. The history covers that case.

## Order of work

1. Many agents.
2. Keyboard shortcuts and find in page.
3. Zoom.
4. Viewport sizes.
5. Downloads.
6. History.
7. Reopen closed tab.
8. Docs: the README "AI1 Browser" section, and a "Changes in M3b part A" note in
   the M3a spec.

## Risks

Each task checks its risk first.

- **Do CDP key events fire `before-input-event`?** Task 2 checks this with a real
  `Input.dispatchKeyEvent`. The rule "no catching on a connected agent tab"
  protects the agent in both cases.
- **Debugger handover.** The viewport function and the agent proxy use the same
  `webContents.debugger`. Task 4 tests the order (AI1 detaches, then the agent
  attaches) and a connection that comes while a preset is being set.
- **No real app opens in e2e.** The shell wrapper is stubbed in the e2e tests.
- **e2e windows stay hidden.** All new tests run only through `npm run test:e2e`.

## Tests

The same method as M3a: a failing test first, then the code. Pure logic is in
`src/common` or in main-process classes with no `electron` import, and plain Node
mocha tests it.

- Unit tests:
  - `AgentTabs` and `AgentProxies`: two clients at the same time, the waiting
    tab is used once, and a closed tab ends only its own client.
  - The shortcut list.
  - The zoom steps and `ZoomStore` (profile and host, and bad JSON).
  - The viewport presets and the "Custom…" check.
  - `DownloadStore`: the limit of 100, the load rule "in progress becomes
    failed", and bad JSON.
  - The progress throttle.
  - `HistoryStore`: the 1-minute merge, the 90-day cut, the 10,000 limit, the
    Agent profile rule, and bad JSON.
  - The reopen list: at most 20, and last in, first out.
- e2e tests:
  - Two Playwright clients at the same time: each client sees only its own page.
  - Find in a fixture page, with the match count.
  - The zoom stays after the tab loads the page again.
  - The iPhone preset gives `window.innerWidth` 393 and
    `navigator.maxTouchPoints` above 0, read through the agent address. An agent
    connection clears the preset.
  - A fixture download shows in the Downloads view. "Show in Finder" calls the
    stubbed wrapper.
  - After two page visits, "Show History" finds both pages.
  - Close a tab, press ⇧⌘T, and the same address comes back.

## Part A is complete when

- Two agents can use two AI1 tabs at the same time, and each agent sees only its
  own page.
- Find, zoom, viewport sizes, downloads, history, and reopen closed tab work as
  written above.
- All gates pass: lint, typecheck, unit tests, format, build, and e2e (hidden).

## Changes during the implementation

- **The agent address answers `/json/list` and `/json` with `[]`.** Only a
  WebSocket connection gets a tab. A plain HTTP request must not use up the
  "Waiting for agent" mark or open an empty tab. This also changes the M3a
  rule that the fake browser answers `/json/list` with exactly one target
  (see the new note in the M3a spec).
- **Tab marks show the agent number and the page title.** A connected agent
  tab shows "Agent \<n\> · \<page title\>" with a green "●". A waiting tab
  shows "· Waiting for agent" after its title. This lets the owner read the
  agent state and the page title at the same time. The agent address server
  also keeps every client, so it can close all of them when it stops.
- **The browser keybindings use a context key, scoped to each tab.** A real
  test showed that a CDP key event (Playwright) does not fire
  `before-input-event`. So an agent's keys never reach the shortcut catch in
  the main process, and the front end needs its own way to give its
  keybindings priority. Each browser tab node gets a context key. A
  keybinding with this context wins over a Theia keybinding with the same
  keys (Find, Source Control ⇧⌘G, the window zoom ⌘+, ⌘-, and ⌘0, and Reopen
  Closed Editor ⇧⌘T), only while a browser tab has the focus. Esc in the find
  bar is also a keybinding, with a context scoped to the find bar itself, so
  it fires only while the bar has the focus.
- **The zoom key drops the port.** The key is the profile and the host name,
  with no port, the same as Chrome. Chromium shares one zoom level for each
  host name in a session, not for each port.
- **The viewport release has a time limit.** The release before an agent
  connects waits at most 2 seconds, then detaches the debugger of AI1. A page
  that does not answer must not block an agent connection. Each emulation
  command has its own limit of 5 seconds, for the same reason. The command
  "Browser: Set Viewport…" gives the owner a way to change the viewport size
  without the toolbar menu.
- **Two test-only download settings need the hidden e2e mode.**
  `AI1_E2E_DOWNLOADS_DIR` and `AI1_E2E_SHELL_LOG` work only when
  `AI1_E2E_BACKGROUND=1`. A normal start of AI1 never uses them. The toggle
  command for the Downloads view is "View: Toggle Downloads", the standard
  Theia name for a view toggle.
- **The history quick pick uses an item button, not ⌘Enter.** Theia's quick
  pick has no hook for a modifier-Enter. The item button "Open in New Tab"
  replaces ⌘Enter. When an agent is connected to the current tab, Enter opens
  the page in a new tab instead of the current one.
