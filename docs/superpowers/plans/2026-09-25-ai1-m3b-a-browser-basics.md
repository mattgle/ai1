# AI1 M3b part A: Many Agents and Browser Basics — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** More than one agent can use the AI1 browser at the same time, and the browser gets find in page, zoom, viewport sizes, a downloads list, history, and "reopen closed tab".

**Architecture:** Changes to the existing extension `extensions/browser-pane` only. Shared state (zoom, downloads, history) lives in small JSON stores in the main process, with no `electron` import, the same pattern as `ProfileStore`. The front end talks to them through the preload API (`Ai1BrowserApi`) and new IPC channels in `src/common/browser-ipc.ts`.

**Tech Stack:** Theia 1.75.0, Electron 42.8.1, TypeScript, mocha, Playwright e2e (hidden mode).

**Spec:** `docs/superpowers/specs/2026-09-25-ai1-m3b-a-browser-basics-design.md`. Read it with this plan. The spec is the authority for behavior and for all user-visible text. The M3a spec `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md` stays the authority for all rules that the part A spec does not change.

## Global Constraints

- Every `@theia/*` dependency stays exactly `1.75.0`. No new third-party dependency.
- All prose is ASD-STE100 Simplified Technical English: commit messages, code comments, documents, and user-visible text. No divider comments in test files.
- Commits have no `Co-Authored-By` line and no other attribution line. Commits are signed through 1Password: on a signing error, wait 30 seconds and retry, at most 5 times; never bypass signing; if it still fails, leave the files staged and report. Implementers run only `git add <own paths>` and `git commit`.
- Privacy: before each commit, `git diff --cached | grep -nE '/Users/|<local user name>|@gmail|~/'` gives no match. No home path or user name in reports.
- Gates before each commit: `npm run lint && npm run typecheck && npm test && npm run format:check`, then `npm run build` and `npm run test:e2e` (inside `e2e/`).
- Machine: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`; before a build `export CC=/usr/bin/cc CXX=/usr/bin/c++`. Before a build or an e2e run, `pgrep -fl "personal/ai1/applications/electron"` must be empty.
- **The e2e windows must never appear on the owner's screen.** Run e2e only with `npm run test:e2e` inside `e2e/`. Never start AI1 or Electron any other way. Never use `--install`.
- **No e2e test opens a real app or Finder window, and no e2e test writes into the owner's Downloads folder.** Use the test-only environment variables of Task 5.
- Every app start uses isolated user data. Never write into the real AI1 user data folder. Never touch the owner's OpenCode service beyond what existing tests do. The agent secret never goes into a log, a notification, or a report.
- Test first: a failing test (RED, with its output recorded) before each change, then GREEN.
- The current e2e count is 48. Each task reports the new count.
- Pure logic goes in `src/common` or in a main-process class with no `electron` import, so plain mocha tests it (`*.spec.ts` next to the file).
- New IPC: each new channel is in `Channels` in `src/common/browser-ipc.ts`, each new method is in `Ai1BrowserApi` and in `src/electron-browser/preload.ts`, and each `ipcMain.handle` checks that the sender is a Theia window (not an AI1 page), the same as the existing handlers.

## Review Focus

These cases are not in the spec's test list, but they are the most likely to hurt the owner. Each one has a test in the task that owns the code.

1. **The waiting tab closes, or loads a new profile, before an agent connects.** Expected: the next connection gets a new Agent tab, and the stale mark is gone. (Task 1, unit test.)
2. **An agent connects while AI1 sets a viewport preset on the same tab.** Expected: the agent gets the debugger, the emulation is cleared, and nothing throws in the main process. (Task 4, unit test with a fake debugger.)
3. **A single-page app changes its address many times each second (`pushState`).** Expected: the history does not grow by one entry for each change within 1 minute of the same address, and the store writes at most once in 5 seconds. (Task 6, unit test.)
4. **Zoom on a page with no host (`about:blank`, a `data:` error page) and on in-page navigations.** Expected: no zoom entry is saved for an empty host, and an in-page navigation on the same host does not change the zoom. (Task 3, unit test.)
5. **⌘+ on a keyboard where "+" needs Shift, and ⌘= without Shift.** Expected: both zoom in. ⌘F with Shift or Alt is not caught. (Task 2, unit test.)

---

### Task 1: Many agents

**Files:**
- Modify: `src/electron-main/agent-tabs.ts` (+ `agent-tabs.spec.ts`), `src/electron-main/agent-proxies.ts` (+ `agent-proxies.spec.ts`), `src/electron-main/agent-address.ts`, `src/electron-main/browser-main-contribution.ts`, `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/agent-contribution.ts`, `src/browser/browser-widget.ts`, the browser style file.
- Test: `e2e/src/m3a-browser.spec.ts` (update the existing agent tests), new `e2e/src/m3b-basics.spec.ts`.

**Interfaces:**
- Produces:
  - `AgentTabs`:
    - `giveTab(windowId: number, tabId: string | undefined): void` sets or clears the one waiting tab (in all windows);
    - `waitingTab(): { windowId: number; tabId: string } | undefined`;
    - `resolve(): Promise<number>` takes the waiting tab if its guest is alive, else asks for a new tab;
    - `connected(guestId: number, number: number): void` and `disconnected(guestId: number): void`;
    - `stateFor(windowId: number): AgentTabState[]`.
  - `AgentProxies.isConnected(guestId: number | undefined): boolean` stays.
  - A new host hook, `AgentTabsHost.beforeAgentAttach(guestId: number): Promise<void>`. Task 1 makes it a no-op. Task 4 uses it to clear the viewport emulation.
  - In `browser-ipc.ts`:
    - `export interface AgentTabState { tabId: string; state: "waiting" | "connected"; number?: number }`;
    - the channel `agentState` now sends `AgentTabState[]` (all entries for that window);
    - `Ai1BrowserApi.giveToAgent(tabId: string | undefined): Promise<void>` replaces `setAgentTab`;
    - `onAgentState(listener: (states: AgentTabState[]) => void)`.
  - `BrowserWidget`:
    - `setAgentState(state: AgentTabState | undefined): void` replaces `setAgentMark`;
    - `get agentConnected(): boolean`, which Tasks 2, 4, 6, and 7 use.

Requirements:
1. `AgentProxies.accept` no longer stops the other proxies. Each guest has its own proxy and at most one client. A second client for the same guest cannot occur, because each connection gets its own guest. If it does occur, the old client of that guest is replaced, as today.
2. `AgentTabs` keeps:
   - the one waiting tab (`{ windowId, tabId }` or none);
   - a set of connected guests with their number.

   The numbers count from 1 for each AI1 run, and a number is never used again in the same run.
3. `resolve()`:
   - If there is a waiting tab and `guestOf(windowId, tabId)` is alive, it clears the waiting mark and returns that guest.
   - Else it clears a stale waiting mark and asks the window that had the focus last for a new Agent tab (the existing request flow, with the timeout).
   - It never returns a guest that has a client now.
   - A tab that `resolve()` asks for is not a waiting tab. `tabCreated` and `guestRegistered` finish the pending request directly, and they do not call `giveTab`.
   - If `AgentAddress.resolveTarget` then refuses the connection because DevTools is open on that guest, the waiting mark comes back on that tab (the spec: "The mark stays").
4. `giveTab` on a tab whose guest has a connected agent does nothing. The "Give to agent" button is disabled on that tab.
5. When a client disconnects, the tab becomes a normal tab: no mark, and no number. When a guest is destroyed, its entry is removed.
6. The state message: after each change, each Theia window gets the list of its own tabs that are waiting or connected. The front end sets the state of each widget from the list, and a widget that is not in the list gets `setAgentState(undefined)`.
7. The widget:
   - The "Waiting for agent" mark is a CSS class on the tab title and the caption text "(waiting for agent)".
   - The "Agent" mark: the M3a classes `ai1-browser-agent-tab` and `ai1-browser-agent-connected`.
   - While connected, the tab label is `Agent <n> · <page title>`.
   - `dispose()` of a waiting tab clears the waiting mark.
8. A new command "Browser: Cancel Give to Agent" (`ai1.browser.cancelGiveToAgent`) clears the waiting mark. It is enabled only while a tab waits.
9. Remove from `agent-address.ts` the per-window logic `agentTabOf` and `agentConnected(windowId)`, and replace it with `stateFor`.

Tests:
- Unit (`agent-tabs.spec.ts`):
  - two `resolve()` calls with no waiting tab ask for two new tabs;
  - a waiting tab is used once, and a second `resolve()` asks for a new tab;
  - a waiting tab whose guest is gone gives a new tab (Review Focus 1);
  - a waiting tab after a profile change (a new guest id for the same tab id) gives the new guest (Review Focus 1);
  - numbers go 1, 2, 3 and are not used again after a disconnect;
  - `giveTab` on a connected guest does nothing;
  - a DevTools refusal puts the waiting mark back (test the part in `AgentTabs` that does this, for example `restoreWaiting(windowId, tabId)`).
- Unit (`agent-proxies.spec.ts`): two guests with one client each stay connected together, and `remove` of one guest stops only its client.
- e2e (new `m3b-basics.spec.ts`, with its own isolated user data and the agent address on, as `m3a-browser.spec.ts` does): two Playwright clients connect at the same time. Each client goes to a different fixture page, and each client sees exactly one page, its own. Both tabs show the "Agent" mark with a different number. Close one tab: only that client ends.
- Update the existing agent e2e tests in `m3a-browser.spec.ts` to the new rules (for example, "Give to agent" now means "waiting").

Commit message: "Give each agent connection its own browser tab".

---

### Task 2: Keyboard shortcuts and find in page

**Files:**
- Create: `src/common/shortcuts.ts` (+ spec), `src/browser/find-bar.ts`.
- Modify: `src/electron-main/guest-policies.ts` (or a new `src/electron-main/guest-shortcuts.ts`), `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/browser-widget.ts`, `src/browser/browser-contribution.ts`, the style file.

**Interfaces:**
- Consumes: `BrowserWidget.agentConnected` (Task 1). The main process knows which guests have a connected agent through `AgentProxies.isConnected(guestId)`.
- Produces:
  - `export type BrowserShortcut = "find" | "findNext" | "findPrevious" | "closeFind" | "zoomIn" | "zoomOut" | "zoomReset" | "reopenClosedTab" | "focusAddress"`.
  - `export function shortcutFor(input: { type: string; key: string; meta: boolean; control: boolean; shift: boolean; alt: boolean }, findOpen: boolean): BrowserShortcut | undefined`. This is macOS only: `meta` is ⌘.
  - The channel `shortcut` (main → window): `{ tabId: string; shortcut: BrowserShortcut }`.
  - `Ai1BrowserApi.setFindOpen(guestId: number, open: boolean): Promise<void>` tells the main process to catch Esc for that guest.
  - `BrowserWidget.runShortcut(shortcut: BrowserShortcut): void` is the one entry point for Tasks 3, 4, and 7. In this task it handles the find shortcuts and `focusAddress`, and ignores the others.

Requirements:
1. **Check the risk first.** Record in the report whether `before-input-event` fires for a CDP `Input.dispatchKeyEvent`. Test it through the agent address in a scratch e2e run, and do not commit the scratch test. The rule of step 2 applies in both cases.
2. In the main process, `before-input-event` on each AI1 page (`GuestPolicies.attach`) calls `shortcutFor`, only for `type === "keyDown"`. It returns at once when the guest has a connected agent. If `shortcutFor` returns a shortcut, it calls `event.preventDefault()` and sends `{ tabId, shortcut }` to the window of that tab (through `GuestRegistry.entry`).
3. `shortcutFor` rules:
   - ⌘F → find;
   - ⌘G → findNext; ⇧⌘G → findPrevious;
   - Escape with no modifier → closeFind, only when `findOpen`;
   - ⌘= and ⌘+ (with or without Shift) → zoomIn;
   - ⌘- → zoomOut; ⌘0 → zoomReset;
   - ⇧⌘T → reopenClosedTab;
   - ⌘L → focusAddress;
   - any other key, and any of the keys above with Control or Alt → undefined.

   ⌘F with Shift is undefined.
4. The front end registers the same shortcuts as Theia keybindings with a `when` context `ai1BrowserFocus` (a context key set while a `BrowserWidget` has the focus). Each keybinding runs a command that calls `runShortcut` on the current browser widget. Commands:
   - `ai1.browser.find` "Browser: Find in Page";
   - `ai1.browser.findNext`;
   - `ai1.browser.findPrevious`;
   - `ai1.browser.focusAddress`.
5. The find bar (`find-bar.ts`, a small DOM class that the widget owns) sits below the toolbar. It has the text field, the count text, and the Previous, Next, and Close buttons with codicons. It uses the `<webview>` methods `findInPage(text, { forward, findNext })` and `stopFindInPage("clearSelection")`, and the `found-in-page` event (`result.activeMatchOrdinal`, `result.matches`).
   - The count text is "3 of 12". It is "No results" when there are no matches and the text is not empty, and empty when the text is empty.
   - Enter → next. ⇧Enter → previous. Esc in the field → close.
   - Typing starts a new search at each input.
6. The find bar closes on a main-frame `did-navigate`, and on a profile change.

Tests:
- Unit (`shortcuts.spec.ts`): each rule above, plus Review Focus 5:
  - ⌘+ with Shift and ⌘= without Shift both give zoomIn;
  - ⇧⌘F, ⌥⌘F, and ⌃⌘F give undefined;
  - Escape gives closeFind only with `findOpen`;
  - a `keyUp` gives undefined.
- e2e: open a fixture page that has the word "apple" 3 times. Run "Browser: Find in Page" (through the command, because the tests cannot type into the page), type "apple" in the find field, and check "1 of 3". Press Enter and check "2 of 3". Press Escape: the bar closes.

Commit message: "Add find in page and browser keyboard shortcuts".

---

### Task 3: Zoom

**Files:**
- Create: `src/common/zoom.ts` (+ spec), `src/electron-main/zoom-store.ts` (+ spec).
- Modify: `src/electron-main/browser-main-contribution.ts`, `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/browser-widget.ts`, `src/browser/browser-contribution.ts`, the style file.

**Interfaces:**
- Consumes: `BrowserWidget.runShortcut` and the keybinding pattern of Task 2.
- Produces:
  - `export const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500]`;
  - `export function nextZoom(percent: number, direction: 1 | -1): number`;
  - `export function zoomKey(profileId: string, url: string): string | undefined`. It gives `"<profileId> <host:port>"`, and undefined for a URL with no http(s) host.
  - `class ZoomStore { constructor(filePath: string); load(): void; get(key: string): number; set(key: string, percent: number): void }`. `get` gives 100 when there is no entry. `set(key, 100)` removes the entry.
  - Channels:
    - `getZoom(profileId, url) → number`;
    - `setZoom(profileId, url, percent) → void`, which broadcasts `zoomChanged { key: string; percent: number }` to all windows.

Requirements:
1. `nextZoom` moves to the next step up or down from the current value. A value between two steps goes to the nearest step in that direction. At the ends it stays.
2. The store file is `ai1-browser-zoom.json` in the user data folder. Bad JSON gives an empty store. It writes at once on each change (changes are rare).
3. The widget:
   - After each main-frame `did-navigate` to a new `zoomKey`, it gets the level and applies it with `webview.setZoomFactor(percent / 100)`.
   - It does not apply on `did-navigate-in-page` when the key is the same.
   - On `zoomChanged` with its current key, it applies the new level.
   - The shortcuts zoomIn, zoomOut, and zoomReset compute the new level and call `setZoom`.
   - With no `zoomKey`, the shortcuts do nothing.
4. The toolbar shows a zoom button with the text "<n>%" only when the level is not 100. A click sets 100.
5. Commands "Browser: Zoom In", "Browser: Zoom Out", and "Browser: Reset Zoom", with the keybindings of Task 2.

Tests:
- Unit:
  - `nextZoom`: 100 up gives 110, 100 down gives 90, 500 up gives 500, 25 down gives 25, and 105 up gives 110 and down gives 100;
  - `zoomKey` for `http://localhost:3000/a` and for `about:blank` and `data:` (undefined, Review Focus 4);
  - `ZoomStore`: set and get, 100 removes the entry, bad JSON, and two profiles on the same host are separate.
- e2e: open a fixture page and run "Browser: Zoom In" two times. The button shows "125%", and the page's `window.devicePixelRatio` (read with `webview.executeJavaScript` from the IDE page) is 1.25 times the value before. Reload the tab: the level stays. "Browser: Reset Zoom": the button goes away.

Commit message: "Add zoom for each site and profile to the browser".

---

### Task 4: Viewport sizes

**Files:**
- Create: `src/common/viewport.ts` (+ spec), `src/electron-main/viewport-emulation.ts` (+ spec).
- Modify: `src/electron-main/agent-address.ts` (the `beforeAgentAttach` hook), `src/electron-main/browser-main-contribution.ts`, `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/browser-widget.ts`, the style file.

**Interfaces:**
- Consumes: `AgentTabsHost.beforeAgentAttach(guestId)` (Task 1). `BrowserWidget.agentConnected` (Task 1).
- Produces:
  - `export interface ViewportPreset { id: string; label: string; width: number; height: number; deviceScaleFactor: number; mobile: boolean; userAgent?: string }`;
  - `export const VIEWPORT_PRESETS: ViewportPreset[]` with the ids `iphone-15`, `pixel-8`, `ipad-air`, and `ipad-pro-12-9`, and the sizes and ratios of the spec;
  - `export type ViewportChoice = { kind: "off" } | { kind: "preset"; id: string; rotated: boolean } | { kind: "custom"; width: number; height: number }`;
  - `export function validateCustomSize(width: number, height: number): string | undefined` gives the error text or undefined (200 to 4000, whole numbers);
  - `export function resolveViewport(choice: ViewportChoice): { width: number; height: number; deviceScaleFactor: number; mobile: boolean; userAgent?: string } | undefined`;
  - `class ViewportEmulation`, constructed with a debugger-like object `{ isAttached(): boolean; attach(version: string): void; detach(): void; sendCommand(method: string, params?: object): Promise<unknown> }`. It has `apply(settings | undefined): Promise<void>` and `release(): Promise<void>`. Calls are serialized with the existing `SerialQueue`.
  - Channel `setViewport(guestId, choice) → { ok: true } | { ok: false; error: string }`.

Requirements:
1. The user agent strings are the real Safari iOS 17 string for iPhone 15 and iPad, and the Chrome Android string for Pixel 8. Put them as constants in `viewport.ts`.
2. `apply(settings)`:
   - If the debugger is not attached, attach it (`"1.3"`).
   - Send `Emulation.setDeviceMetricsOverride { width, height, deviceScaleFactor, mobile }`.
   - Send `Emulation.setTouchEmulationEnabled { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 }`.
   - Send `Emulation.setUserAgentOverride { userAgent }` when there is one. When there is none, send `Emulation.setUserAgentOverride` with the default user agent of the page (`webContents.getUserAgent()`), which the caller passes in.

   `apply(undefined)` clears the overrides (`Emulation.clearDeviceMetricsOverride`, touch off, and the default user agent) and detaches.
3. `release()` is the agent handover. If AI1 attached the debugger, it clears the overrides, then detaches. After `release()`, a pending `apply` does nothing.
4. An attach error means that DevTools is open. The IPC result is `{ ok: false, error: "Close DevTools to use viewport sizes." }`.
5. After an `apply` with a new user agent, the main process reloads the page (`webContents.reload()`).
6. The agent handover:
   - `AgentAddress.resolveTarget` awaits `beforeAgentAttach(guestId)`, which calls `release()` on the emulation of that guest, before it creates or uses the proxy.
   - The widget gets `agentConnected` true, shows "Responsive (off)", and disables the menu.
   - After the agent disconnects, the menu works again, with the choice "off".
7. The widget:
   - A toolbar button with the codicon `device-mobile` opens a menu (a Theia context menu, or a simple DOM popup like the profile select) with the entries of the spec.
   - "Custom…" uses `QuickInputService.input` two times (width, then height) with `validateCustomSize`.
   - "Rotate" is enabled only for a preset.
   - With a size, the `<webview>` element gets that CSS size (in CSS pixels) and sits in the center of the viewport area, on the background `var(--theia-editor-background)` with a border. A label above it shows "393 × 852".
8. The choice is part of `storeState()` and `restoreState()` (the key `viewport`). After a restore, the widget applies it after its first `dom-ready`.
9. When a guest is destroyed, its emulation object is removed.

Tests:
- Unit:
  - `validateCustomSize`: 199, 4001, 1.5, and NaN give errors, and 390 × 844 gives undefined;
  - `resolveViewport`: an iPhone preset rotated swaps the width and height; "off" gives undefined;
  - `ViewportEmulation` with a fake debugger: `apply` sends the three commands in order; `apply(undefined)` clears and detaches; `release()` during a pending `apply` leaves the debugger detached and sends no command after the detach (Review Focus 2); an attach that throws gives the DevTools error.
- e2e:
  - Open a fixture page and choose iPhone 15 through the command "Browser: Set Viewport…" (`ai1.browser.setViewport`). This command shows the same entries as a quick pick, so the test does not need the menu. Read the values with `webview.executeJavaScript` from the IDE page: `innerWidth` is 393, and `navigator.maxTouchPoints` is above 0.
  - Then give that tab to the agent, and connect Playwright through the agent address. Through Playwright, `innerWidth` is not 393 (the preset is cleared). In the IDE page, the viewport button of that tab is disabled.

Commit message: "Add phone and tablet viewport sizes to the browser".

---

### Task 5: Downloads

**Files:**
- Create: `src/common/downloads.ts` (+ spec), `src/electron-main/download-store.ts` (+ spec), `src/electron-main/shell-actions.ts`, `src/browser/downloads-widget.tsx`, `src/browser/downloads-contribution.ts`.
- Modify: `src/electron-main/guest-policies.ts` (the `will-download` handler), `src/electron-main/browser-main-contribution.ts`, `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/browser-frontend-module.ts`, the style file.
- Test: `e2e/src/browser-fixture-server.ts` (a download route), `e2e/src/m3b-basics.spec.ts`.

**Interfaces:**
- Produces:
  - `export type DownloadState = "progressing" | "completed" | "cancelled" | "failed" | "deleted"`;
  - `export interface DownloadEntry { id: string; fileName: string; savePath: string; url: string; profileId: string; totalBytes: number; receivedBytes: number; startTime: number; state: DownloadState; error?: string }`;
  - `export class ProgressThrottle { constructor(intervalMs: number, now: () => number); shouldSend(id: string): boolean; forget(id: string): void }`;
  - `class DownloadStore { constructor(filePath: string, fileExists: (path: string) => boolean); load(): void; list(): DownloadEntry[]; add(entry: DownloadEntry): void; update(id: string, change: Partial<DownloadEntry>): void; remove(id: string): void; clearFinished(): void; refreshDeleted(): void }`, with a limit of 100 and newest first;
  - `class ShellActions { openPath(path: string): Promise<string>; showItemInFolder(path: string): void }`;
  - Channels:
    - `listDownloads`, `cancelDownload(id)`, `openDownload(id)`, `showDownload(id)`, `removeDownload(id)`, `clearDownloads()`;
    - the broadcast `downloadsChanged` (`DownloadEntry[]`).

Requirements:
1. **Test-only settings,** read only when `AI1_E2E_BACKGROUND=1`:
   - `AI1_E2E_DOWNLOADS_DIR` replaces `app.getPath("downloads")`.
   - `AI1_E2E_SHELL_LOG`: `ShellActions` appends one JSON line (`{"action":"show","path":...}`) to that file and does not call `shell`.

   `m3b-basics.spec.ts` sets both variables to temp paths before the launch, and removes them after. First check that the launcher passes `process.env` to the Electron process. If it does not, pass the variables through the launch options.
2. `will-download`:
   - Keep the unique name and the folder of M3a.
   - Add an entry (state `progressing`) with a new id (`randomBytes(8).toString("hex")`).
   - On `updated`, update the bytes, and broadcast only when `ProgressThrottle.shouldSend(id)` (500 ms).
   - On `done`, set `completed`, `cancelled`, or `failed`, and broadcast at once.
   - Keep the `DownloadItem` in a map by id for Cancel, and remove it on `done`.
3. `DownloadStore.load()`:
   - Bad JSON gives an empty list.
   - An entry with the state `progressing` becomes `failed` with `error: "AI1 closed during the download."`.
   - The store writes on each state change and at most once in 2 seconds for progress.
4. `refreshDeleted()` sets `deleted` on a `completed` entry whose file is gone. `listDownloads` calls it first.
5. `openDownload` and `showDownload` work only for an entry with the state `completed` whose file exists. They go through `ShellActions`. `openDownload` shows the error text of `shell.openPath` when it is not empty.
6. The "Downloads" view (`downloads-widget.tsx`, a `ReactWidget`, id `ai1-downloads`) is in the right panel, next to Ports. Copy the patterns of `ports-widget.tsx` and `ports-contribution.ts`: the view container, the badge, and the toggle command "View: Downloads".
   - A row shows the file name, the host of the address, and an "Agent" label for the Agent profile.
   - While it runs, the row shows a progress bar (or "Downloading…" when the total is 0). When it is done, it shows the size and the date. Otherwise it shows "Cancelled", "Failed: <error>", or "Deleted".
   - The row buttons are Cancel, Open, and Show in Finder. The context menu has "Remove from List".
   - The toolbar has "Clear List".
   - The badge is the number of entries in progress, and it updates at start, before the view opens (as the Ports badge does).
7. The "done" notice gets the action "Show in Finder": send the entry id with the notice, and add a new channel `downloadDone { id, fileName, state }` in place of the plain `notice` text for downloads.

Tests:
- Unit:
  - `ProgressThrottle`: the first call sends, a call 100 ms later does not, and a call 500 ms later sends; `forget` resets;
  - `DownloadStore`: the limit of 100 drops the oldest; load turns `progressing` into `failed`; bad JSON; `clearFinished` keeps the entries in progress; `refreshDeleted` with a fake `fileExists`.
- e2e:
  - The fixture server serves `/download.txt` with `Content-Disposition: attachment`. Open it in a tab. The Downloads view lists `download.txt` as done, and the file is in the test downloads folder.
  - "Show in Finder" adds a `show` line with that path to the shell log.
  - The badge goes back to no number.

Commit message: "Add a Downloads view to the browser".

---

### Task 6: History

**Files:**
- Create: `src/common/history.ts` (+ spec), `src/electron-main/history-store.ts` (+ spec).
- Modify: `src/electron-main/guest-policies.ts` (or a new `src/electron-main/history-recorder.ts`), `src/electron-main/browser-main-contribution.ts`, `src/electron-main/profile-store.ts` (delete the history on a profile delete), `src/common/browser-ipc.ts`, `src/electron-browser/preload.ts`, `src/browser/browser-contribution.ts`.

**Interfaces:**
- Consumes: `AgentProxies.isConnected(guestId)` (Task 1), through a function that `AgentAddress` gives.
- Produces:
  - `export interface HistoryEntry { url: string; title: string; time: number }`;
  - `export function shouldRecord(url: string, profileId: string): boolean`. It is false for the Agent profile and for any scheme that is not `http:` or `https:`;
  - `export function dayLabel(time: number, now: number): string`. It gives "Today", "Yesterday", or a date such as "Sep 23, 2026" (use `toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })`);
  - `class HistoryStore`:
    - `constructor(folder: string, now: () => number, writeFile, readFile)`;
    - `visit(profileId: string, url: string, title: string): void`;
    - `setTitle(profileId: string, url: string, title: string): void`;
    - `list(profileId: string): HistoryEntry[]`, newest first;
    - `clear(profileId: string): void`;
    - `deleteProfile(profileId: string): void`;
    - `flush(): void`;
  - Channels: `listHistory(profileId)` and `clearHistory(profileId)`.

Requirements:
1. The store:
   - Files are `ai1-browser-history/<profileId>.json`.
   - `visit` with the same URL as the newest entry, within 60 000 ms, updates the time and title of that entry.
   - Entries older than 90 days are dropped at load and at each write.
   - At most 10 000 entries for each profile: the oldest go first.
   - Writes are debounced to at most one in 5 000 ms for each profile. `flush()` writes at once, and the main process calls it on `before-quit`.
   - Bad JSON gives an empty history.
2. The recorder, on each AI1 page (in `GuestPolicies.attach`, or a small class that it calls):
   - `did-navigate` (main frame) and `did-navigate-in-page` with `isMainFrame` call `visit`.
   - `page-title-updated` calls `setTitle` for the current URL.
   - Nothing is recorded when `shouldRecord` is false or when the guest has a connected agent.
   - The profile is `profileIdFromStoragePath(contents.session.storagePath)`.
3. "Browser: Show History" (`ai1.browser.showHistory`):
   - It uses `QuickInputService.createQuickPick` for the profile of the current browser tab (else Default).
   - Items have `label` = title (or the URL when the title is empty), `description` = URL, and `detail` = `dayLabel`. `matchOnDescription` is true.
   - Enter opens the URL in the current browser tab (`navigate`), or in a new tab when no browser tab has the focus.
   - An item button "Open in New Tab" (codicon `link-external`) opens it in a new tab. Theia's quick pick has no ⌘Enter hook, so the item button replaces ⌘Enter. Record this in the report as a change to the spec.
4. "Browser: Clear History…" (`ai1.browser.clearHistory`) asks "Clear the browsing history of the profile "<name>"?" with the action "Clear History", then calls `clearHistory`.
5. `deleteProfile` in the main process also calls `HistoryStore.deleteProfile(id)`.

Tests:
- Unit:
  - `shouldRecord`: http, https, about, data, file, and the Agent profile;
  - `dayLabel` at the day edges;
  - `HistoryStore` with a fake clock and fake files: the 60-second merge; a new entry after 61 s; the 90-day cut; the 10 000 limit; the debounce (many `visit` calls within 5 s give one write, Review Focus 3); `flush`; `deleteProfile` removes the file; bad JSON.
- e2e: visit two fixture pages with titles "History One" and "History Two" in a Default tab. Run "Browser: Show History", type "History": both items are in the list, and "History Two" is first. Choose "History One": the tab goes to that page.

Commit message: "Add browsing history to the browser".

---

### Task 7: Reopen closed tab

**Files:**
- Create: `src/common/closed-tabs.ts` (+ spec).
- Modify: `src/browser/browser-tabs.ts`, `src/browser/browser-widget.ts`, `src/browser/browser-contribution.ts`.

**Interfaces:**
- Consumes: `BrowserWidget.agentConnected` (Task 1), `BrowserWidget.runShortcut` (Task 2), the viewport choice in `storeState()` (Task 4).
- Produces:
  - `export interface ClosedTab { url: string; profileId: string; viewport: ViewportChoice; previousTabId: string | undefined }`;
  - `class ClosedTabs { push(tab: ClosedTab): void; pop(): ClosedTab | undefined }` with a limit of 20;
  - `BrowserTabs.reopenClosed(): Promise<BrowserWidget | undefined>`.

Requirements:
1. When a browser widget closes by the owner (`onCloseRequest`, not at shutdown), `BrowserTabs` pushes its state. `previousTabId` is the tab id of the browser tab to its left in the same tab bar, if there is one.
2. A tab with a connected agent, and a tab with `about:blank`, are not pushed.
3. `reopenClosed` pops the last entry and opens it with `open(url, profileId, { ref })`. `ref` is the widget of `previousTabId` when it is still open. Then it applies the viewport choice.
4. The command "Browser: Reopen Closed Tab" (`ai1.browser.reopenClosedTab`) has the keybinding ⇧⌘T. Also run it from `runShortcut("reopenClosedTab")`. When the list is empty, it does nothing.

Tests:
- Unit (`closed-tabs.spec.ts`): last in, first out; the 21st push drops the oldest; `pop` on an empty list gives undefined.
- e2e: open a fixture page in a tab, close the tab, and run "Browser: Reopen Closed Tab". A tab with the same address comes back.

Commit message: "Add Reopen Closed Tab to the browser".

---

### Task 8: Docs

**Files:**
- Modify: `README.md` (the "AI1 Browser" section), `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md` (a short section "Changes in M3b part A" at the end), and `docs/superpowers/specs/2026-09-25-ai1-m3b-a-browser-basics-design.md` (a section "Changes during the implementation", only if a task changed the spec, for example the ⌘Enter item of Task 6).

Requirements:
1. The README tells the owner how to use more than one agent, "Give to agent", find, zoom, viewport sizes, the Downloads view, history, and "Reopen Closed Tab", with the shortcuts. It uses no home path.
2. The M3a spec note names the two rules that part A replaced and links to the part A spec.
3. The gates pass. The e2e count is in the report.

Commit message: "Document the browser basics and the agent rules of M3b part A".
