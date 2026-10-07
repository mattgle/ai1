# Rounded panels and terminal attention

Status: local implementation. Isolated and packaged macOS tests pass. Installed
versions are checked. Full CLI hook lifecycle and native Omarchy tests remain open. This work does not change the
installed app or agent settings.

## Appearance

Terminal Shift+Enter sends line feed, the Ctrl+J newline key supported by
OpenCode. Enter keeps its carriage-return input. The handler changes no agent
configuration. It leaves other modifier combinations, input composition,
read-only terminals, and press-to-close terminals unchanged.

A packaged regression reads the input bytes after xterm and tmux. Before the
fix, Shift+Enter and Enter both send byte 13. After the fix, they send bytes
10 and 13. All ten terminal shortcut tests pass in the local signed package.
This result does not replace live agent-hook lifecycle verification.

Tabs use five-pixel upper corners. Panel surfaces use six-pixel corners, thin
borders, and four-pixel gaps. Each activity bar shares a frame with its side
panel. The outer frame uses a small two-pixel vertical inset. Side-panel content
is clipped at the rounded corners. The dark frame and status bar use a neutral
background. Light and high-contrast themes keep separate color values.
Existing icons and tab names stay unchanged. Changes rows keep the same height
during hover and keyboard focus.

Activity selection uses a 32-pixel rounded background instead of an edge marker.
Tree rows use four-pixel corners and four-pixel horizontal insets. Selection,
hover, and keyboard focus keep the same row height. High-contrast activity
selection keeps a visible outline.

These rules follow the public VS Code Modern UI source at revision
`d04893d507790cc1aa567b41fbbad049f5f14fa0`. The implementation adapts the rules
to Theia widgets. It does not copy VS Code components or replace native window
controls. The native macOS title bar still uses OS rendering. Exact visual
comparison also depends on the VS Code version, theme, and UI settings.

The color registry exposes `ai1.frameBackground`, `ai1.sidePanelBackground`, and
`ai1.panelBorder`. These colors support Theia color customization without
changing theme preferences. Layout spacing is set before saved-layout
restoration so pane sizes remain stable across restarts.

- Thin blue border and very light tint: the agent works.
- Amber border and light tint: input is pending.
- Green border and light tint: the agent response ends.
- Red border and light tint: a supported event reports a turn failure.

Selecting a tab clears completion and failure. A new turn can produce a new
decoration. Input attention does not clear on selection. A hover gives a text
label. Light and high-contrast themes keep visible attention borders.

## OpenCode

Tabs opened from Agents use the existing session event stream. Permission
requests keep their individual IDs. Question forms use the V2 pending-form
endpoint. Older servers without that endpoint do not provide form attention.

Each session starts inside a normal persistent shell in its directory. Its tab
starts with `sh ·`. When OpenCode exits, the shell stays open. You can start
Codex or another command there. Selecting that session again only focuses its
existing shell. Session deletion and idle cleanup remove the session link but
keep the shell open. Close the terminal tab to close its tmux client.

A helper marks the session link in a tmux user option while OpenCode runs.
It clears the option when OpenCode exits. AI1 polls this option so an old
OpenCode session does not hide hooks from another agent in the same shell.
The saved tab keeps its session identity for focus and restart restoration.
AI1 does not read terminal output to detect exit or activity.

For OpenCode started manually in an AI1 persistent shell tab:

1. Select that terminal.
2. Run **Terminal: Link Terminal to OpenCode Session** from the command palette.
3. Select the exact session running in that terminal.

AI1 does not infer a session from its directory. Several sessions can use the
same directory. The link changes no OpenCode setting. Link again after an app
restart or after starting a different session in that shell.

## Claude Code and Codex

Run **Terminal: Set Up Agent Attention Hooks** from the command palette.
The read-only dialog gives the helper path and hook definitions. Opening it
does not change any file.

Use Node 24 on PATH. Run the CLI in an AI1 persistent shell tab. Merge the
generated hooks with existing settings. Preserve existing hooks and permission
settings. Get approval before changing a global settings file. Codex requires
review and trust through `/hooks`. Do not bypass hook trust. Update the helper
path if the checkout or app location changes.

The adapters return an empty JSON object. They do not approve, deny, or change
agent actions. Unknown events and identified subagent callbacks are ignored.
A stopped response does not prove that all requested work succeeds. Other stop
hooks can continue the agent.

Permission hooks do not supply a tool-call ID. The adapter keeps permission
attention until a definite turn or session boundary. A new prompt, turn stop,
or session end clears it. An unrelated successful tool does not clear it.
Question-tool callbacks can clear a request when they supply matching IDs.
Without matching IDs, the same turn-boundary rule applies. Claude MCP
elicitation hooks also provide input attention.

Claude's `StopFailure` hook provides failure attention. Codex has no matching
failure hook in the reviewed reference. A failed command does not prove a failed
turn. Verify each installed CLI version before claiming full support.

## Local state and limits

The hook bridge uses private files in AI1's configuration folder. Files store
state, pending counts, hashed IDs, a timestamp, and an update token. They do not
store prompts, answers, tool arguments, output, or conversation logs. The helper
receives hook input in memory and discards the other fields.

The directory uses mode 0700. State files use mode 0600. The helper uses a
file-lock library and atomic replacement. Reads reject symlink records and
oversized files. AI1 matches each record to an existing tmux pane. Reusing a
terminal name does not reuse a dead pane's attention. No network port is opened.

Each poll handles at most 64 terminal or session IDs. Checks run about once per
second. A disconnected app keeps its last known state. Hook write failures do
not change agent decisions. Completion acknowledgement is local to the current
window. A restored shell can show its last recorded outcome again.

The integration covers AI1 persistent shell tabs, not external terminal windows
or terminals created outside AI1's persistent-shell flow. Gemini CLI setup is
opt-in. Antigravity is deferred by owner decision.

### Gemini CLI

Merge the setup dialog's hooks into `~/.gemini/settings.json` or project settings.
Keep existing hooks and the CLI's project trust checks. AI1 does not write this file.
`BeforeAgent` marks working. `AfterAgent` marks completion. A `ToolPermission`
notification marks input attention. Gemini supplies no matching permission ID in
this signal. Input attention stays until a definite turn or session boundary.
`SessionStart` and `SessionEnd` clear the state. Unsupported failures stay unmarked.
Gemini hook timeouts use milliseconds. The setup uses 2000 milliseconds.
The helper reports attention only. It does not return an approval decision.
Live Gemini lifecycle checks remain open.

## Verification

Unit tests cover acknowledgement, input priority, event mapping, concurrent
updates, private file modes, stale identities, and symlink rejection. Electron
tests use a fake OpenCode service and a separate tmux server. They test
permissions, forms, completion, failure, the hook helper, setup instructions,
and theme changes. They make no real provider request.

The Electron harness uses `--no-sandbox`. These tests do not prove sandbox safety.

The current local checks pass: 732 workspace unit tests, six language-resource
tests, 21 release checks, three archive-security tests, lint, type checks,
formatting, and whitespace checks. All 34 tests in the combined packaged UI
suite pass, including the 14 attention tests.
They cover working status, badge bounds, permissions, forms, outcomes, theme
changes, Control+C, normal restart, session deletion, and idle cleanup.

The macOS test package builds and passes signature verification. The packaged
setup dialog returns an existing helper path. The tests run that helper and
verify Claude and Codex attention records without changing agent settings.
The build still reports `require.resolve` warnings for the hook and session-shell
helpers. Both helpers resolve and run in packaged tests.

Installed versions are Claude Code 2.1.282 and Codex 0.159.0. The offline schema
generated by the installed Codex binary includes the configured hook events.
It has no turn-failure hook. The Claude version and official hook reference
match the configuration shape. These checks do not prove every live CLI event.
Full hook lifecycle tests and native Omarchy behavior remain open.

## Isolated live startup review: 2026-10-05

Each installed CLI starts in a separate temporary home and workspace through
a pseudo-terminal. The check sends no input and no model prompt. It does not
supply login credentials, hook-trust approval, or permission bypass flags.
The check stops each process after a bounded startup interval.

Claude reaches setup in the isolated home. Codex and Gemini do not establish
a usable session in that interval. No hook lifecycle event is verified by
this check. No generated hook configuration is installed in these homes.
The check establishes startup limits only, not an adapter integration result.
Full working, permission, completion, failure, and session-end validation
remains open. Existing packaged fixtures still provide separate adapter coverage.

Claude's print-mode help states that non-interactive mode skips workspace
trust. This review does not use that mode to avoid the trust dialog. Codex's
hook-trust bypass and Gemini's skip-trust options also remain unused.
Global settings and existing trust decisions stay unchanged.

## Official references

### Offline schema check: 2026-10-06

Installed versions remain Claude Code 2.1.282, Codex 0.159.0, and Gemini 0.46.0.
The installed Codex binary generates an offline protocol schema in the review
folder. Its managed-hook definition accepts all seven events configured by AI1:
SessionStart, SessionEnd, UserPromptSubmit, PermissionRequest, PreToolUse,
PostToolUse, and Stop. It has no StopFailure event. The generated requirements
schema has SHA-256
`0ea97959b59322ec8901c79bf597b7241f42a10fe11034a4d86b3a6b044a43df`.

The current official Codex and Gemini references still supply no reliable
turn-failure event for these adapters. Unsupported failures remain unmarked.
These checks do not establish live lifecycle events. No login, setup, global
settings, permissions, or hook-trust decisions change. Full live validation
requires a usable session with approved setup and hook trust.

### Isolated command lifecycle check: 2026-10-07

`node --test scripts/terminal-hook-lifecycle.spec.mjs` runs the source helper
through the generated hook commands. It uses a separate tmux socket, an empty
temporary home, and no tmux configuration file. The helper and configuration
sources are prepared only in the temporary test directory. The test does not
build or start Electron. It does not start an agent CLI or send a model request.

Ten checks pass. Fixture sequences cover all configured events for Claude,
Codex, and Gemini. They verify working, pending input, completion, session end,
Claude failure, and matching question and elicitation replies. Permission input
stays pending after an unrelated tool result. Unsupported failure events and
child callbacks leave the record unchanged. The checks also cover invalid
stdin, non-AI1 panes, changed pane and session identities, private file modes,
and refusal to use a state directory with unsafe permissions. Every helper
invocation returns only `{}`. Paths with spaces and an apostrophe work.
The 11 existing hook unit tests also pass from temporary test files. Scoped
ESLint and formatting checks pass. Workspace build output stays unchanged.

These are fixture integration results, not live agent event results. Installed
CLI version commands still report Claude Code 2.1.282, Codex 0.159.0, and Gemini
0.46.0. A new offline Codex schema check gives the same requirements-file hash
as the 2026-10-06 check. It still has no `StopFailure` hook.

Live validation remains blocked. Claude's isolated startup reaches setup and
needs the owner's setup choices. The startup diagnosis below identifies the
Codex and Gemini gates. No existing login, global configuration, permission
policy, or trust decision changes. Print mode and trust bypass flags are not a
substitute for owner approval. Codex and Gemini turn failures remain unsupported
and unmarked.

### Isolated startup diagnosis: 2026-10-07

The review runs `codex --no-daemon` and `gemini` through `node-pty`. Each process
uses its own empty temporary home and workspace. The environment contains only
`PATH`, `HOME`, `TERM=xterm-256color`, and a temporary `TMPDIR`. No prompt,
keypress, terminal-query reply, login choice, or trust answer is sent. The first
corrected checks wait 12 seconds. A repeat uses new homes and waits eight seconds.
Only the processes and directories created by these checks are removed.
`--no-daemon` keeps Codex separate from the existing shared daemon.

Both runs identify these first-use gates:

- Codex 0.159.0 shows `Sign in with ChatGPT`, device-code login, or API-key
  selection. The CLI waits at its login menu. No choice is selected.
- Gemini 0.46.0 shows `Do you trust the files in this folder?`. The CLI waits
  at workspace trust. No trust answer is sent.

Codex emits one cursor-position query and one device-attribute query in the
12-second check. Its login menu still appears without replies. Gemini also
reports a true-color warning. These signals do not prevent the observed menus.
The repeat has no observed fatal startup error. It does not verify later stages.

An initial Codex probe sets `CODEX_HOME` to a directory that does not exist.
It exits with `Error finding codex home: CODEX_HOME points to
"<temporary-home>/.codex", but that path does not exist`. This is a probe setup
error, not an installed-CLI failure. The corrected runs omit `CODEX_HOME` and
reach the login menu. An explicit `CODEX_HOME` must name an existing directory.

The real home contains `.codex/auth.json`, `.codex/config.toml`,
`.gemini/settings.json`, `.gemini/oauth_creds.json`, `.gemini/google_accounts.json`,
and `.gemini/trustedFolders.json`. The review checks file existence and metadata
only. It does not open these files. Their metadata stays unchanged during the
repeat. `CODEX_HOME`, `GEMINI_CLI_HOME`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and
`GOOGLE_API_KEY` are unset in the reviewed parent environment. File presence
does not prove valid or expired authentication.

Changing `HOME` hides the normal Codex configuration and file-based login data.
Installed Gemini code also puts settings, file-based OAuth data, and folder
trust under its selected home. `GEMINI_CLI_HOME` can override that home. The probe
does not set this variable. Some optional Gemini storage uses the OS keychain,
so `HOME` alone is not a general keychain isolation guarantee. This review does
not query that storage or select an authentication method.

The Codex login menu is therefore an empty-home artifact. It does not show that
the owner's existing login is missing or invalid. Gemini's observed blocker is
the new workspace trust decision, not a confirmed authentication failure.
Further live validation needs owner approval to use an existing authenticated
session and its normal runtime files, or owner setup of a separate test login.
Gemini also needs an owner-approved workspace trust decision. All adapters need
opt-in hooks; Codex needs hook review and trust through `/hooks`. These steps
remain outside this check. No live hook event or model request is verified.

### Links

- [OpenCode CLI plugin events](https://opencode.ai/v2/docs/build/plugins/cli)
- [OpenCode V2 API](https://opencode.ai/v2/docs/api)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Gemini CLI hooks](https://geminicli.com/docs/hooks/reference/)
- [VS Code Dark Modern colors](https://github.com/microsoft/vscode/blob/d04893d507790cc1aa567b41fbbad049f5f14fa0/extensions/theme-defaults/themes/dark_modern.json)
- [VS Code activity selection](https://github.com/microsoft/vscode/blob/d04893d507790cc1aa567b41fbbad049f5f14fa0/src/vs/workbench/contrib/modernUI/browser/media/activityBar.css)
- [VS Code row corners](https://github.com/microsoft/vscode/blob/d04893d507790cc1aa567b41fbbad049f5f14fa0/src/vs/workbench/contrib/modernUI/browser/media/roundedCorners.css)
- [VS Code row insets](https://github.com/microsoft/vscode/blob/d04893d507790cc1aa567b41fbbad049f5f14fa0/src/vs/workbench/contrib/modernUI/browser/media/padding.css)
- [VS Code floating panel frame](https://github.com/microsoft/vscode/blob/d04893d507790cc1aa567b41fbbad049f5f14fa0/src/vs/workbench/browser/media/floatingPanels.css)
