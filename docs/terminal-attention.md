# Rounded panels and terminal attention

Status: local implementation. Isolated and packaged macOS tests pass. Installed
versions are checked. Full CLI hook lifecycle and native Omarchy tests remain open. This work does not change the
installed app or agent settings.

## Appearance

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
