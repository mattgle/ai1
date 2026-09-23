# AI1 M2 design: agents

Date: 2026-09-22
Status: approved design, before the M2 implementation plan

M2 adds the agent sessions to AI1. It replaces the M2 section of the M1 design
(`2026-09-21-ai1-design.md`): AI1 talks to the OpenCode service directly, and
Herdr is not a part of AI1.

## Goal

- A view of all OpenCode sessions of the workspace, grouped by repository, with
  the live status of each one.
- A click opens a session in a terminal tab in the center.
- A new session in a chosen repository, in one action.
- A notice when a session waits for a permission.
- Shell terminals that continue when AI1 is closed.

## Decisions and their reasons

| Decision | Reason |
|---|---|
| The source of the agent data is the OpenCode service, through its HTTP API and its event stream | OpenCode v2 runs as a background service that owns the sessions. The interactive interface is a client of that service. The service gives the session list, the running sessions, the pending permissions, and an event stream. This is the first-hand source of the status. |
| Herdr is not a part of AI1 | Herdr's status for OpenCode comes from a plugin that Herdr installs into OpenCode, so Herdr is a relay of the same data. AI1 without Herdr has one daemon fewer to keep current. The owner keeps Herdr for manual use in a terminal. |
| A session opens in a plain Theia terminal that runs `opencode --session <id> <dir>` | The interface process is disposable. The session lives in the service. A closed tab loses nothing. |
| Shell terminals persist through tmux | tmux is the standard tool for this job, it is stable, and its command line has not changed in years. `brew install tmux` is the only setup. |
| No interface process opens by itself on start | Each OpenCode interface process costs about 216 MB. A click on a card opens it. |
| The service password never leaves the back end | The front end gets data through RPC. The password goes into no RPC message, no log, and no message to the user. |

## Verified facts

Checked on the installed binaries on 2026-09-22 (OpenCode v2.0.12, Herdr 0.9.1):

- `opencode serve --service` is the background service. `opencode service status`
  prints its URL (`http://127.0.0.1:<port>`). `opencode service start` starts it.
- The service uses HTTP basic authentication. The password is in
  `~/.config/opencode/service.json`, key `password`. A request with no password
  gets 401.
- `GET /api/session` lists sessions with `id`, `title`, `model`, `outcome`
  (`succeeded`, `failed`, `interrupted`), `time` (`created`, `updated`, `idle`),
  and `location.directory`. Query parameters: `limit`, `order`, `search`,
  `directory`, `project`, `cursor`.
- `GET /api/session/active` gives a map of the sessions that run now.
- `GET /api/permission/request` gives the pending permission requests.
- `GET /api/session/{id}/message?limit=1&order=desc` gives the last message.
- `POST /api/session` creates a session. `POST /api/session/{id}/prompt` with
  `{ "text": "..." }` sends a prompt. `DELETE /api/session/{id}` deletes one.
- `GET /api/event` is a server-sent event stream. A prompt produced these event
  types: `session.execution.started`, `session.step.started`,
  `session.step.streamed`, `session.step.ended`, `session.usage.updated`,
  `session.execution.succeeded`, `session.inbox.enqueued`,
  `session.inbox.delivered`, `session.instructions.updated`. The first event
  is `server.connected`.
- `opencode --session <id> <directory>` opens the interface on an existing
  session. The interface process uses about 216 MB and about 1 % CPU at idle.
  The service uses about 579 MB, independent of the number of sessions.
- Herdr's OpenCode integration is a plugin file in `~/.config/opencode/` that
  reports the session state to Herdr.
- tmux is not installed on the owner's machine at the time of this design.

To verify in the M2 plan, in code, before use: the event type names for a
pending permission and for a failed execution; the exact shape of the
`session.active` map and of the permission request; the query parameter that
the message list needs for the newest message first.

## Architecture

One new native Theia extension, `extensions/agents`, with the same pattern as
`changes-view`: pure logic with unit tests, a service on the Node side, Theia's
RPC channel to the front end, and a view in the right area.

```
extensions/agents
├── common/     RPC protocol, types, pure logic (status, groups, card text)
├── node/       OpenCodeClient (HTTP and SSE), TmuxRunner, AgentsServiceImpl
└── browser/    AgentsWidget, commands, terminal management
```

No custom extension depends on another custom extension. The repository
detection that `changes-view` has (direct children of the workspace root with a
`.git` folder) is either repeated in `agents` or moved into a shared package
`extensions/common`. The plan decides.

### Back end

`OpenCodeClient`:

- Finds the service URL with `opencode service status`. If the service does not
  run, runs `opencode service start` one time and waits up to 10 seconds.
- Reads the password from `~/.config/opencode/service.json`.
- Holds one connection to `GET /api/event`. On a cut, it reconnects with a
  growing wait from 1 to 30 seconds. After a reconnect it repeats the initial
  load, because events can be lost.
- Makes the calls: session list, active sessions, pending permissions, last
  message, create session, delete session.

`AgentsServiceImpl` holds the session state in memory and gives the front end,
through RPC: `load()` (all groups and cards), `lastMessage(id)`,
`createSession(directory)`, `deleteSession(id)`, and an event
`onSessionChanged(summary)` with one card.

`TmuxRunner`: `tmux ls` parsed into a list of `ai1-*` sessions; the command
line for a new session `tmux new -A -s ai1-<n> -c <dir>`.

### Status of a session

Pure logic, from three sources:

| Status | Rule |
|---|---|
| `working` | The session is in the active map, or `session.execution.started` came and its end did not. |
| `blocked` | The session has a pending permission request. |
| `done` / `failed` | `outcome` of the session after `session.execution.succeeded` or `failed`. |
| `idle` | None of the above. |

`blocked` wins over `working`. `working` wins over `done` and `failed`.

### Data flow

**Initial load.** Three calls in parallel: the session list (pages of 100,
newest first, up to 200 by default), the active map, and the pending
permissions. "Newest first" means the order of `time.updated`, not
`time.created` (verified live 2026-09-23: `order=desc` puts a session with
an old creation time but a recent update ahead of one created after it but
never touched since). The 200-session cap is global, over every session
the OpenCode service holds, taken before AI1 filters by workspace root --
so a workspace can show fewer of its own sessions than it actually has,
when 200 more recently active sessions of other workspaces or repositories
push its older ones past the cap. When this happens, the view shows one
line saying so. The cards are complete except for the last message. The
last message comes in a second pass, only for the visible sessions (the 30
newest of each group). A card that is not visible shows its title until
its group expands.

**Live updates.** Each event changes the state of one session in memory. The
back end emits `onSessionChanged` with that card. The view updates that card
and does not reload the list.

| Event | Effect |
|---|---|
| `session.execution.started` | status `working` |
| `session.execution.succeeded` or `failed` | status `done` or `failed`; the last message of that session loads again |
| a permission event | `blocked` while a permission is pending |
| `session.step.ended`, `session.usage.updated` | the counter and the age update |
| a session created or deleted | the card appears or goes |

**Cost.** The initial load is one call per 100 sessions plus one call per
visible card. An event costs one card update. The interface process of a
session is the only cost that grows with open tabs.

### Front end

**The Agents view.** A `TreeWidget` in the right area, ranked after Changes.
Two levels:

- A group per directory: the repository name (the last folder of the
  directory), a badge with the session count, and a button "new session". The
  groups sort by their newest session. A group starts expanded when one of its
  sessions is `working` or `blocked`.
- A card per session: a status icon on the left (codicons: `sync` with
  `codicon-modifier-spin` working, `warning` blocked in the warning color,
  `check` done, `error` failed, `circle-outline` idle); the title; the last
  message in one line, cut;
  a third line `<N> msgs · <age> · <model>`. On hover: "open terminal" and
  "delete session" (with a confirm dialog).
- A line at the top of the view: "<N> terminals open".
- A second line, only when the 200-session cap actually hid a session:
  "Showing the 200 newest OpenCode sessions of the service. Older sessions
  are not listed." Shown too when the workspace has no session card yet,
  so the cap is not silently invisible in an otherwise empty view.

**Commands**, in the palette under the category "Agents":

- `Agents: New Session` — a quick pick of the workspace repositories; creates
  the session and opens its terminal.
- `Agents: Open Session` — a quick pick with a search by title.
- `Agents: Delete Session` — with a confirm dialog.
- `Agents: Close Idle Terminals` — closes each terminal tab whose session is
  not `working` and not `blocked`. The sessions stay in the service.
- `Agents: Refresh`.
- `Terminal: New Persistent Terminal` — a quick pick of the workspace
  repositories; opens `tmux new -A -s ai1-<n> -c <dir>`.

**Terminals.** A session tab is a Theia `TerminalWidget` with the process
`opencode --session <id> <dir>` and the title `OC · <title>`. A shell tab has
the title `sh · <repo>`. AI1 keeps a map `sessionId → terminal` in memory, so a
second click focuses the tab instead of a second process. On start, the tmux
sessions `ai1-*` open their tabs again, without focus. The OpenCode tabs do not
open by themselves.

**Blocked notice.** When a session becomes `blocked`, Theia shows a
notification with the session title and a button "Open". The Agents tab shows
a badge with the number of blocked sessions. The notification closes when the
session is no longer blocked.

**Preferences**, in the front-end config of the application:
`ai1.agents.visibleSessionsPerGroup` (30) and `ai1.agents.notifyOnBlocked`
(true).

## Error behavior

| Case | Behavior |
|---|---|
| `opencode` is not in the PATH | The view shows "OpenCode is not installed" and the install command (`brew install anomalyco/tap/opencode-v2`, the owner's OpenCode v2 tap; the plain `opencode` formula installs the old 1.x line), with a Retry button. |
| The service does not start | A message with the output of `opencode service start` and a Retry button. |
| No password in `service.json`, or 401 | The view shows "AI1 cannot authenticate with the OpenCode service" and the exact name of the credentials file, `~/.config/opencode/service.json`, never the full path. A Retry button shows too. |
| A load error of any other kind | The view shows the error message, with a Retry button. A click on Retry runs a fresh load, the same as the Refresh command. |
| The event stream is cut | "Reconnecting…" shows in the view, also when the view lists no session yet. The wait grows from 1 to 30 seconds. A full load runs after the reconnect. |
| The global session cap (200) hides an older session of this workspace | The view shows a line: "Showing the 200 newest OpenCode sessions of the service. Older sessions are not listed." Shown also with no session card yet. |
| A call for one session fails (404, the session was deleted) | AI1 confirms with a second, independent call (`GET /api/session/{id}`) before it trusts the 404. Confirmed: the card goes, the same way a `session.deleted` event removes it, and AI1 does not ask again for that session. No notice shows. Not confirmed (the session still exists): AI1 treats the 404 as a normal error and asks again later. |
| `tmux` is not in the PATH | "New Persistent Terminal" shows the install command. Theia's own terminal stays available. |
| `opencode --session` exits with an error in a tab | The tab keeps the error output, as any terminal. |

## Tests

- **Unit, pure logic** (mocha, no Theia): the status rules from the active map,
  the permissions, and the events; the groups and their order; the third line
  of a card (relative age, counter); the `tmux ls` parser; the SSE parser
  (`event:` and `data:` lines, an event split across chunks).
- **Unit, back end with a fake server**: a local `http.Server` that imitates
  `/api/session`, `/api/session/active`, `/api/permission/request`, and
  `/api/event`. Tests: the initial load, an update from one event, the
  reconnect, the 401, and that the password is in no RPC payload.
- **End-to-end**, in the M1 suite, against the real OpenCode service, with a
  session that the test creates and deletes: the view shows the group and the
  card; a click opens a terminal with the title `OC · …`; a short prompt moves
  the card to `working` and then to `done`. And a tmux test: "New Persistent
  Terminal" creates an `ai1-*` session that `tmux ls` lists; the test kills it
  at the end.
- **Measurement**: memory and CPU at idle with the view open and the event
  stream connected, with the M1 method.

## M2 is complete when

1. The Agents view lists the OpenCode sessions of the workspace, grouped by
   repository, with the live status.
2. A click opens the session in a terminal tab in the center.
3. "New Session" creates a session in a chosen repository and opens it.
4. A session that waits for a permission shows a notice and a badge.
5. A persistent terminal survives a close and a start of AI1.
6. A closed AI1 kills no OpenCode session.
7. Lint, type check, unit tests, and end-to-end tests pass.

## Setup at the start of M2

`brew install tmux`. OpenCode v2 is installed already.

## Carried from the M1 final review

Minor defects of `changes-view` to fix in M2, before the agents write into the
repositories: an in-flight gate for the scans during write bursts; the discard
of a staged new file (`git restore` for every tracked file); a missing `git`
binary must give a message, not "no changes"; the labels for a detached head
and for a repository without commits; sibling repositories that are symbolic
links; `git status --porcelain -z` for quoted paths.
