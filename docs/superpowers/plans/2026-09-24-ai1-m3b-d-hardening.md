# AI1 M3b part D: Hardening and Small Items — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security items that the M3a reviews deferred, add "Stop Server…" to the Ports view, and fill two test gaps.

**Architecture:** Changes to the existing extension `extensions/browser-pane` only. No new extension, no new dependency.

**Tech Stack:** Theia 1.75.0, Electron 42.8.1, TypeScript, mocha, Playwright e2e (hidden mode).

**Design:** approved in chat on 2026-09-24 (a bounded change, so there is no spec file). The M3a spec `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md` stays the authority for the browser. Each task below lists its exact requirements.

## Global Constraints

- Every `@theia/*` dependency stays exactly `1.75.0`. No new third-party dependency.
- All prose is ASD-STE100 Simplified Technical English: commit messages, code comments, documents. No divider comments in test files.
- Commits have no `Co-Authored-By` line and no other attribution line. Commits are signed through 1Password: on a signing error, wait 30 seconds and retry, at most 5 times; never bypass signing; if it still fails, leave the files staged and report. Implementers run only `git add <own paths>` and `git commit`.
- Privacy: before each commit, `git diff --cached | grep -nE '/Users/|<local user name>|@gmail|~/'` gives no match. No home path or user name in reports.
- Gates before each commit: `npm run lint && npm run typecheck && npm test && npm run format:check`, then `npm run build` and `npm run test:e2e` (inside `e2e/`).
- Machine: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`; before a build `export CC=/usr/bin/cc CXX=/usr/bin/c++`. Before a build or an e2e run, `pgrep -fl "personal/ai1/applications/electron"` must be empty.
- **The e2e windows must never appear on the owner's screen.** Run e2e only with `npm run test:e2e` inside `e2e/`. Never start AI1 or Electron any other way. Never use `--install`.
- Every app start uses isolated user data. Never write into the real AI1 user data folder. Never touch the owner's OpenCode service beyond what existing tests do. The agent secret never goes into a log, a notification, or a report.
- Test first: a failing test (RED, with its output recorded) before each change, then GREEN.
- The current e2e count is 42. Each task reports the new count.

---

### Task 1: Browser page security

**Files (expected):** `src/common/guest-policy.ts` (+ spec), `src/electron-main/guest-policies.ts`, `src/electron-main/browser-main-contribution.ts`, e2e in `e2e/src/m3a-browser.spec.ts` or a new `e2e/src/m3b-hardening.spec.ts`.

Requirements:
1. **Block `file:` in every AI1 profile session.** In `GuestPolicies.ensureSession`, register a `file` protocol handler on the profile session that returns an error response (`session.protocol.handle("file", () => Response.error())`; verify the Electron 42 API). The `did-start-navigation` guard stays as a second layer. Test: e2e — an agent `page.goto("file:///etc/hosts")` still fails, AND a page script `fetch("file:///etc/hosts")` fails, AND the owner's `webview.loadURL("file:///etc/hosts")` (through `page.evaluate` on the IDE page, as the existing loadURL test does) never shows the file (no `hosts` content in the tab title; use a fixture page that sets its title from the fetch result).
2. **No nested pages.** `forceGuestPreferences` sets `webviewTag: false`. `GuestPolicies.attach(contents)` adds a `will-attach-webview` listener on the guest that always calls `preventDefault()`. Unit test for `forceGuestPreferences` (the `webviewTag` key); a unit or e2e check that a guest cannot attach a `<webview>`.
3. **Stricter AI1-page check.** `profileIdFromStoragePath` returns an id only when the folder above the last one is `Partitions`. `GuestPolicies.isAi1BrowserContents` returns true only when `profileIdFromStoragePath(contents.session.storagePath)` gives an id (for a `webview` type too). Unit tests: a path `/x/ai1-browser-default` (no `Partitions`) gives no id; `/x/Partitions/ai1-browser-default` gives `default`.
4. **"Continue anyway" only for AI1 pages.** `GuestPolicies.acceptCertificate` does nothing unless the web contents with that id exists and `isAi1BrowserContents` is true (the local-host rule stays).
5. **Popup limit.** A guest can open at most 5 popups (tabs or windows) in any 10-second window. More are refused (`{ action: "deny" }`), and the owner gets one notice for each burst: "A page tried to open too many popups. AI1 blocked the rest." Put the counting rule in a pure function in `src/common/guest-policy.ts` (for example `popupAllowed(times: number[], now: number): boolean` with the limit constants) with unit tests: the 5th in 10 s is allowed, the 6th is refused, one after 10 s is allowed again. An e2e check with a fixture page that calls `window.open` 8 times: at most 5 new tabs appear.

Commit message: "Block file addresses, nested pages, and popup floods in the browser".

---

### Task 2: Agent address hardening

**Files (expected):** `src/electron-main/agent-address-server.ts` (+ spec), `src/electron-main/agent-address.ts`, `src/electron-main/one-page-proxy.ts` (+ spec).

Requirements:
1. **Exact WebSocket path.** An upgrade is accepted only for `/<secret>/devtools/browser` (after the secret check); any other path gets `404` and the socket is closed. Unit test.
2. **Host and Origin checks.** HTTP requests and upgrades are refused with `403` unless the `Host` header is exactly `127.0.0.1:<port>` or `localhost:<port>`. An upgrade with an `Origin` header is refused with `403` (a CDP client such as Playwright sends no `Origin`; a web page always does). Unit tests for each case, and the existing Playwright e2e test must still pass.
3. **Serialized configuration.** `AgentAddress.configure` runs each call after the previous one has finished (a promise chain), so two quick changes cannot leave a server without a reference. The secret file is read or created before `this.config` changes; if that fails, the result is `{ ok: false, error }` and the state stays "off". Test the chaining in a unit-testable piece (move the chain into a small class without Electron imports if needed).
4. **Attach failure closes the client.** In `OnePageProxy.acceptClient`, when the debugger attach fails (the `ready` promise rejects), the client is closed, `onClientChange(false)` is called once, and no message waits for ever. Unit test with a fake debugger whose `attach` throws.

Commit message: "Harden the agent address against wrong hosts, origins, and failed attaches".

---

### Task 3: "Stop Server…" in the Ports view, and tests of the real lsof runner

**Files (expected):** `src/common/ports-protocol.ts`, `src/node/ports-service-impl.ts` (+ spec), `src/browser/ports-contribution.ts`, `src/browser/ports-widget.tsx`, e2e.

Requirements:
1. `PortsService` gets `stopServer(pid: number, port: number): Promise<{ ok: true } | { ok: false; error: string }>`. The back end first checks, with a fresh scan, that the process with this pid still listens on this port and belongs to a workspace group (not "Other"), and that the process owner is the current user (`process.getuid()` against the owner of the process, for example through `ps -o uid= -p <pid>`). Only then it sends `SIGTERM` (`process.kill(pid, "SIGTERM")`). Otherwise it returns a clear error. Unit tests with an injected command runner and an injected kill function: a workspace process is stopped; an "Other" process, a pid that no longer listens on the port, and a process of another user are refused.
2. The row context menu has "Stop Server…" only for rows in workspace groups. It shows a confirmation (`MessageService.warn` with the action "Stop Server") that names the program, the port, and the process id. After a stop, the view scans again.
3. e2e: start a fixture server in the fixture repository (as the Ports test does), use "Stop Server…" from the context menu, confirm, and check that the process exits and the row goes away.
4. Unit tests for `runLsof`: a missing program gives "AI1 cannot find lsof."; a timeout gives the timeout text; exit code 1 with empty output gives an empty result. Use a fake program on `PATH` in a temp folder or inject `execFile`; do not run the real `lsof` against the owner's processes in unit tests.

Commit message: "Add Stop Server to the Ports view".

---

### Task 4: A split test for browser tabs

**Files (expected):** `e2e/src/m3a-browser.spec.ts` (or `m3b-hardening.spec.ts`).

Requirement: an e2e test opens a browser tab on a fixture page whose script counts up from 0 every 200 ms and shows the count in the page title ("count N"). (The tests cannot click inside a `<webview>` page, so the page counts by itself; a reload would start the count again at 0.) The test waits until the count is at least 10 and records it, then moves the tab into a split to the right of the main area, then checks that the count in the title is still at least the recorded value (the page did not reload). Use Theia's split command if it applies to a non-editor widget; otherwise drag the tab to the right edge of the main area. Report which method works.

Commit message: "Test that a browser tab keeps its page when it moves to a split".
