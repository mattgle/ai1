# Editor release follow-up

Date: 2026-10-07

This record adds evidence for the editor item in the
[release plan](superpowers/plans/2026-10-01-ai1-release-readiness.md).
The [design backlog](superpowers/specs/2026-09-21-ai1-design.md#backlog-typescript-diagnostics-differ-from-vs-code)
keeps the owner-project comparison open.

## Offline results

`scripts/editor-release-offline.spec.mjs` passes all ten checks with the existing
macOS package. No build or package change forms part of this check.

| Input                           | Version |
| ------------------------------- | ------- |
| Node                            | 24.15.0 |
| Workspace TypeScript            | 5.4.5   |
| Development plugin TypeScript   | 5.6.3   |
| Packaged plugin TypeScript      | 5.6.3   |
| Installed React and React types | 19.3.0  |
| Installed ESLint                | 9.39.5  |

Each compiler passes these checks:

- The actual TypeScript server selects each nested project's configuration.
- A loose TypeScript file uses an inferred project, separate from both projects.
- Inherited configuration resolves the compiler's own ES2020 library files.
- Project-local path aliases resolve without files from the sibling project.
- JSX uses the installed React types and rejects a wrong state argument.
- A small React Native declaration fixture resolves through package exports.
  JSX rejects a wrong boolean prop against that contract.
- Removing that declaration reports a missing module. Real type errors remain.
- Hover types resolve `Promise` and imported object properties.
- Definition lookup resolves a project alias and the standard `Error` declaration.
- Completion lists the imported object's properties.
- An open language service updates hover types and diagnostics after file edits.

The ESLint API check selects separate configurations in the two nested projects.
It applies different quote rules and adds semicolons. A non-fixable `eqeqeq`
error remains. A second fix pass makes no further change.

Temporary files hold all fixture changes. TypeScript server processes disable
automatic type acquisition. The tests install no dependencies.

## Packaged pointer-hover result before the command check

The earlier version of `e2e/src/editor-release.spec.ts` passes one isolated
packaged Electron test. It checks
two nested projects in one workspace. It checks real TypeScript diagnostics,
diagnostic removal after an edit, `Promise<string>` hover, alias definitions,
React state diagnostics, and per-project ESLint fixes through editor save.
It checks that a non-fixable lint error remains after save.

The test uses separate app settings, user data, home, state, and cache folders.
It uses the local fake OpenCode server. It does not use a model service.
Workspace settings enable ESLint's standard automatic working-directory mode.
They disable automatic TypeScript type acquisition. App save defaults stay
unchanged. The test checks the combined default formatter and fix-on-save flow.
It does not prove that each save provider works independently.

Two consecutive worker runs pass in 17.7 and 16.3 seconds. The first output folder is
`/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-editor-worker-ui/pointer-hover`.
The final output folder is
`/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-editor-worker-ui/final`.
Only this test runs. No build or other Electron suite runs in this work.

The fixture first reproduces the `/var` versus `/private/var` workspace mismatch.
Its workspace helper now uses the canonical real path. The Electron context-menu
helper then fails before opening a file. Standard Quick Open replaces that
file-open step. Diagnostic hover targets the marked text, not Monaco's
non-interactive squiggle layer.

The earlier command-palette Show Hover path uses the wrong label selector.
See the offline diagnosis below. The passing test checks normal pointer hover
and requires the actual provider result. It does not establish command or
keyboard hover behavior. The test keeps a provider-state attachment for each
project. It adds no delays, test retries, or longer timeouts.

The current test also checks exact command-palette activation before pointer
hover. The later rebuilt-package checks below validate this command path.
The earlier two passing runs do not validate it.

The new E2E file passes its scoped type check. Scoped lint passes for both new
test files. An earlier E2E-wide type check reports an error in
`e2e/src/terminal-attention.spec.ts` at line 386. That file belongs to another
lane and stays unchanged by this work. Electron runs stay sequential.

## Show Hover command diagnosis

The offline follow-up runs while the parent owns the Electron test lane.
It starts no app and makes no build or artifact change.

The ranked causes are a wrong command entry, wrong editor or focus, palette
dismissal, and missing hover-controller registration. The first cause has a
specific selector defect:

| Command ID                           | Installed English label | Matches old `hasText: "Show Hover"` |
| ------------------------------------ | ----------------------- | ----------------------------------- |
| `editor.action.showHover`            | Show or Focus Hover     | No                                  |
| `editor.debug.action.showDebugHover` | Debug: Show Hover       | Yes                                 |

The failed test uses the substring selector and `.first()`. Its API trace records
that selector. The trace contains no Electron DOM snapshots or command events.
It cannot independently prove the dispatched runtime ID. The installed metadata
check proves that the selector excludes the intended semantic action and matches
the debug command. No custom AI1 source registers another Show Hover command.

Relevant installed source:

- `node_modules/@theia/monaco-editor-core/esm/vs/editor/contrib/hover/browser/hoverActions.js`:
  `ShowOrFocusHoverAction` has the label **Show or Focus Hover**. Its `run` method
  gets `editor.contrib.contentHover` and requests immediate keyboard-source hover
  at the current cursor. It returns if the editor has no model or controller.
- `node_modules/@theia/monaco-editor-core/esm/vs/editor/contrib/hover/browser/hoverContribution.js`:
  it registers that action and the content-hover controller before first interaction.
- `node_modules/@theia/debug/src/browser/debug-commands.ts`:
  it registers the separate **Debug: Show Hover** ID.
- `node_modules/@theia/debug/src/browser/editor/debug-editor-service.ts`:
  debug hover uses the debug editor model and selection, not the semantic hover action.
- `node_modules/@theia/debug/src/browser/editor/debug-hover-widget.ts`:
  `doShow` hides the debug hover and returns if the file is not a current debug frame.
  This fixture has no debug session.
- `node_modules/@theia/core/src/browser/quick-input/quick-command-service.ts`:
  `toItem` restores the captured active element and executes the selected command ID.
- `node_modules/@theia/monaco/src/browser/monaco-command.ts`:
  the handler uses Monaco's focused editor, or its active editor as fallback.
  It gets the selected action by ID and calls `action.run()`.

`scripts/editor-hover-command.spec.mjs` passes five offline checks. It loads the
installed palette, Monaco bridge, action, and debug command metadata in memory.
It uses Theia's real command registry. Small test objects supply browser imports,
English localization, editors, and the controller boundary. No generated file
or application build forms part of this test.

The checks prove the label mismatch. They exercise actual palette-item dispatch
through the actual bridge and action with focused-editor and active-editor routes.
They also check missing-editor rejection and the action's missing-controller
return. They do not prove live provider results, DOM rendering, or palette dismissal.

The captured state records the expected `request.ts` URI, cursor at line 6,
column 4, editor focus, and one registered hover provider. The passing pointer
check uses the same content-hover contribution as the intended action.
These facts do not show an app defect. They do not replace command validation.

### Corrected command check

The test now checks the exact **Show or Focus Hover** label before its separate
pointer-hover check. It keeps all save, import, and diagnostic assertions.
It closes any existing hover before each check. It records the real command
registry's will-execute and did-execute events. It requires both events for
`editor.action.showHover`, rejects the debug-hover ID, and requires actual
`Promise<string>` content. It records the URI, cursor, focus, provider state,
action support, and controller presence. It disposes both event subscriptions
in `finally`. Attachments use `command-hover-0` and `command-hover-1`.

The implementation is a test correction, not an app fix. The rebuilt-package
runs below now verify its actual command ID and hover content. If a later
corrected UI check fails, use these additional probes:

1. Select the `request` token at line 6, column 4 in the configured nested file.
2. Record the current editor URI and cursor. Record Monaco's focused and active
   editor URIs from `codeEditorService`. Do not use only `EditorManager` as proof
   of the command's target.
3. Record `control.getAction("editor.action.showHover")?.isSupported()` and
   whether `control.getContribution("editor.contrib.contentHover")` exists.
   Keep the existing provider-registration check.
4. Subscribe to the real command registry's `onWillExecuteCommand` and
   `onDidExecuteCommand` events before opening the palette. Record IDs and errors.
5. Confirm exact label activation. The implemented step uses this pattern, not
   `.first()` or a substring:

```ts
await app.page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+p" : "Control+Shift+p");
const input = app.page.locator(".quick-input-widget .monaco-inputbox .input");
await expect(input).toBeVisible();
await input.fill(">Show or Focus Hover");
const label = app.page
  .locator(".quick-input-widget .monaco-list-row .monaco-highlighted-label")
  .filter({ hasText: /^Show or Focus Hover$/ });
await expect(label).toHaveCount(1);
await label.click();
await expect(app.page.locator(".monaco-hover:visible")).toContainText("Promise<string>");
```

6. Require the recorded ID `editor.action.showHover`. Reject the debug-hover ID.
   Record the final hover content and editor state. Dispose both event subscriptions.

This check directly tests the corrected palette activation. It needs no delay,
retry, or longer timeout. If it still fails with the correct ID, run one separate
keyboard check at the same cursor: `Meta+k`, then `Meta+i` on macOS; use Control
on Linux. Observe command events and require the same hover content. Do not loop.

If direct keyboard activation passes but exact palette activation fails, inspect
focus and hover hide events during palette dismissal. If both fail, use the
recorded Monaco editor IDs and controller state to locate the failed bridge or
action guard. Only then request an app fix. No shared source change is justified
by the current wrong-selector result.

## Rebuilt-package Markdown and command validation

The owner grants an exclusive Electron slot for `editor-release.spec.ts` and
`markdown-security.spec.ts`. No other suite or build runs in this stage.
The existing rebuilt package stays unchanged.

The first seven-test run reproduces the wider-suite Markdown hover failure.
The corrected editor command test passes. All five sanitizer checks pass.
The final documentation hover shows no content despite provider registration.
The original failure record has no exact Monaco mouse target or provider result.
Provider registration alone does not establish that the controller receives a
valid symbol-hover event.

The Markdown selector targets a real text span, not a squiggle drawing layer.
The probe reads `fixtureValue;` and Monaco text target type `6` at line 4,
column 7. The selected word is `fixtureValue`. Hover remains enabled.
The provider returns its real range and `Hover fixture with **bold** documentation.`
The browser renders the expected text and a `strong` element with `bold`.
This evidence does not show a missing TypeScript symbol or a wrong text target.

A temporary probe calls `getContribution`, which can create the hover controller.
Those passing probe runs are not treated as a fix. A later probe reads only
existing controller state. A temporary provider wrapper observes the real
request and returns its result unchanged. The final code removes that wrapper.
It does not invoke or replace any provider.

The final Markdown setup clicks the actual symbol, moves the pointer outside
the editor, and checks editor focus, cursor word, line 4, provider registration,
and an existing controller. It then performs one independent pointer hover.
Controller records read `_contributions._instances`; they do not call a getter
that creates a controller. The existing readiness assertion stays in place.
No sleep, hover retry, test retry, or longer timeout enters the test.
All five sanitizer tests and both real Markdown-rendering assertions stay intact.

The original first-hover event loss has no proven low-level cause. The explicit
interaction setup gives the fixture a verified starting state. The correction
does not establish a server defect or claim an app fix. If the initial-event
cause needs further review, run the original callback with explicit tracing on
the Electron context. Record actual mouse-move, mouse-leave, and model-change
events alongside the real provider request. The current worker traces contain
API calls and attachments, not Electron DOM snapshots.

Two probe runs also expose a separate editor phase-reset problem: Escape does
not close the command hover in the second nested project. The correct show ID
and documentation content already pass. Moving the pointer does not resolve
that cleanup failure. The final fixture resets through the registered
`editor.action.hideHover` command and requires no visible hover before its
pointer check. It does not claim to verify Escape behavior. A separate Escape
investigation needs editor key-event and command-dispatch capture. No shared
source change forms part of this work.

The final code passes **21 of 21 tests** with one worker and three independent
repetitions. Each repetition keeps the seven-test pattern: editor release,
five sanitizer checks, then actual TypeScript documentation hover. The three
editor checks take 17.5, 16.4, and 17.0 seconds. The Markdown hover checks take
2.2, 1.7, and 2.3 seconds. These are independent repetitions, not retries that
hide earlier failures.

Final output:
`/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-hover-corrected-ui/final`.
The initial failure stays in `ai1-hover-corrected-ui/reproduce`. Probe evidence
stays in `provider-record` and `passive-controller` under the same root.

Exact final command:

```sh
PATH="/Users/mattgrote/.npm/_npx/1106a35d869e25fb/node_modules/.bin:$PATH" AI1_PACKAGED_RESOURCES="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app" AI1_E2E_EXECUTABLE="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1" npm run test:e2e --workspace e2e -- editor-release.spec.ts markdown-security.spec.ts --workers=1 --repeat-each=3 --trace=on --output=/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-hover-corrected-ui/final
```

## Escape source route and next regression

The source checks run offline first. The parent then grants an exclusive
Electron slot for the observed and strict probes against the current signed,
rebuilt background package. Both probes pass in sequence. No build or package
change occurs in this lane. The earlier 21 passing tests do not validate Escape.

Both failed records show the correct `editor.action.showHover` will/did events,
the expected nested file, cursor at line 6, column 4, and editor focus before
Escape. The palette-hidden assertion passes. The recorder then stops before
Escape. The records contain no actual DOM active element, Escape key events,
context flags, or command events from Escape. They cannot prove whether Escape
reaches Monaco. A wrong show command is excluded. A focus change after the
record is still possible. A hover-controller defect is not established.

The installed source defines these routes:

- `contentHoverController.js`, `_onKeyDown`: a delivered Escape closes content
  hover unless mouse events are ignored or a key sequence needs more input.
  The normal Escape key is not a modifier or one of the show/verbosity actions.
- `contentHoverWidgetWrapper.js`, `_registerListeners`: Escape on the focused
  hover widget closes that widget through its own DOM key handler.
- `hoverActions.js`, `HideContentHoverAction`: Hide Hover is a separate action.
  It has no dedicated Escape binding in this source. Its success does not prove
  that an Escape event reaches the editor.
- `@theia/core/src/browser/keybinding.ts`, `registerEventListeners` and
  `executeKeyBinding`: Theia handles keys on document capture. A matching real
  command calls `preventDefault` and `stopPropagation` before the editor target.
- `notifications-contribution.ts`: Escape matches `notifications.commands.hide`
  when `notificationsVisible` is true. Editor text focus does not exclude this
  binding. A visible toast or notification center can own the first Escape.
- `quick-command-frontend-contribution.ts`: Escape matches
  `workbench.action.closeQuickOpen` when `inQuickOpen` is true.
  `monaco-quick-input-service.ts` sets that flag on show and clears it on hide.
- `coreCommands.js`: a non-empty editor selection or multiple cursors can also
  give Escape a different command owner.

Global key capture is therefore a concrete alternative to a hover defect,
even when editor focus is true. Notification capture remains a possible cause
of the earlier failures, not a proven cause. The failed records do not prove
that a notification is visible. The new runs have no competing notification.
No app fix is justified by these records.

`scripts/editor-hover-command.spec.mjs` now passes ten offline checks. The five
new checks use the installed controller, notification contribution, Theia
keybinding handler, and real command registry. Small test objects supply
the key-resolution and context boundaries. The checks cover unclaimed Escape,
pending key sequences, the inline-suggestion-menu guard, and notification
capture with visible and hidden notifications. They do not reproduce native
DOM routing or prove a runtime notification in the failed UI runs.

### Correct control before an isolated Escape assertion

- The document has focus.
- The current `request.ts` Monaco text input owns DOM focus. This can be a
  textarea or a native EditContext element. Do not assume a textarea class.
- Monaco's focused and active editor URIs both match that file.
- The palette is hidden and `inQuickOpen` is false.
- No notification, suggestion widget, or context menu owns Escape.
- The cursor has no selection or extra cursors.
- The controller does not ignore events. No Monaco key sequence remains pending.
- The real `Promise<string>` hover is visible. The pointer stays outside it.

`AI1_E2E_ESCAPE_PROBE=1` enables an isolated step in `editor-release.spec.ts`.
It asserts the available focus, context, URI, and menu conditions before one
Escape. It requires the hover to close before any Hide Hover reset. A failed
precondition is a fixture-state failure, not evidence of a hover defect.
Pending-key resolution is recorded when Monaco receives the event.

`AI1_E2E_ESCAPE_PROBE=observe` keeps the original route without clearing other
Escape owners. It presses Escape once and records the resulting events. Its
hover-close assertion can fail when another UI owns Escape. That failure is
diagnostic evidence, not automatic proof of an app bug.

Both modes attach `escape-hover-0` and `escape-hover-1`. The attachments record
DOM active elements, context flags, Monaco editor URIs, controller state, command
IDs, window/document capture and bubble events, Monaco key events, and Monaco's
soft-dispatch result. The listeners close in `finally`. They do not replace
events or provider results. The normal release test still uses Hide Hover only
for phase reset and makes no Escape claim.

The observed run uses this exact command:

```sh
PATH="/Users/mattgrote/.npm/_npx/1106a35d869e25fb/node_modules/.bin:$PATH" AI1_E2E_ESCAPE_PROBE=observe AI1_PACKAGED_RESOURCES="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app" AI1_E2E_EXECUTABLE="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1" npm run test:e2e --workspace e2e -- editor-release.spec.ts --workers=1 --trace=on --output=/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-escape-observe
```

The strict run uses the same command with `AI1_E2E_ESCAPE_PROBE=1` and output
`/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-escape-strict`.
Neither mode uses a sleep, retry, or longer timeout.

### Current package results

The observed suite passes once in 16.3 seconds. The strict suite then passes
once in 16.9 seconds. Each suite checks both nested projects, `web` and `mobile`.
All four Escape attachments show the same actual route:

1. The focused target is `DIV.native-edit-context`, with role `textbox` and
   label `Editor content`. The document and editor have focus. The target is
   inside the current editor, not inside the hover.
2. The Monaco focused and active editor URIs match the current `request.ts`.
   The cursor is at line 6, column 4.
3. `inQuickOpen`, `notificationsVisible`, selection, multiple-cursor, suggestion,
   and menu flags are false. Hover is visible. The controller does not ignore
   events and has no mouse button down.
4. One Escape event passes through window capture and document capture without
   `preventDefault`. Monaco receives key code `9`. Its soft-dispatch result is
   `{ "kind": 0 }`, so no command or pending key sequence owns this event.
5. The event reaches document bubble without `preventDefault`. Hover is already
   closed at that point. The final controller state also reports closed hover.
6. Command records contain only palette activation and `editor.action.showHover`
   will/did events. No notification, close-palette, or Hide Hover command occurs
   before the Escape assertion and its attachment.

These records prove one-Escape closure on the normal editor-text route in the
current package. They do not prove closure with focus inside the hover widget,
an active notification, an open menu, or a pending key sequence. They do not
identify the cause of the two earlier failures or establish which package
change, if any, affects that result. The control failure archives remain intact.
No source fix is proposed. The strict probe remains an explicit normal-route
regression, not a claim that Escape always closes hover regardless of UI state.

The Electron slot returns to the parent after these two runs. Scoped lint,
types, formatting, and ten offline command checks pass after the evidence update.

Interpret the record at the failed seam:

- A notification or close-palette command plus a prevented document-capture
  event, with no Monaco event, establishes another Escape owner.
  A visible notification is a valid owner. A persistently hidden palette with
  `inQuickOpen` still true instead requires a quick-input context review.
- DOM focus outside the current editor establishes a wrong target.
- A Monaco event with a pending-key result establishes the controller's
  key-sequence guard.
- A Monaco event at the correct editor, no competing owner, no ignored-event
  flag, and a visible hover after Escape requires an app/controller review.
  Preserve that event record before requesting a shared-source fix.

## Commands

Run the workspace and development compiler checks:

```sh
node --test scripts/editor-release-offline.spec.mjs
```

Run the ten offline command and Escape checks:

```sh
node --test scripts/editor-hover-command.spec.mjs
```

Add the compiler from the existing local macOS package:

```sh
AI1_PACKAGED_RESOURCES="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app" node --test scripts/editor-release-offline.spec.mjs
```

Check this lane's scripts and owned test files with ESLint:

```sh
node node_modules/eslint/bin/eslint.js scripts/editor-release-offline.spec.mjs scripts/editor-hover-command.spec.mjs e2e/src/editor-release.spec.ts e2e/src/markdown-security.spec.ts
```

Check both owned E2E files with the project's compiler options. Emit no files:

```sh
node node_modules/typescript/bin/tsc --noEmit --strict --noUnusedLocals --skipLibCheck --experimentalDecorators --emitDecoratorMetadata --downlevelIteration --resolveJsonModule --module commonjs --moduleResolution node --target ES2020 --jsx react --lib ES2020,dom --types node e2e/src/editor-release.spec.ts e2e/src/markdown-security.spec.ts
```

Check formatting of this lane's files:

```sh
node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check scripts/editor-release-offline.spec.mjs scripts/editor-hover-command.spec.mjs e2e/src/editor-release.spec.ts e2e/src/markdown-security.spec.ts docs/editor-release-follow-up.md
```

The parent session can run the development Electron test with no build:

```sh
npm run test:e2e --workspace e2e -- editor-release.spec.ts --workers=1
```

For a packaged Electron run, also set `AI1_PACKAGED_RESOURCES` to the package's
`Resources/app` folder and `AI1_E2E_EXECUTABLE` to its Electron executable.
Use the existing package. Do not change the installed app.

Run only this packaged test with cached npm 12 and a separate output folder:

```sh
PATH="/Users/mattgrote/.npm/_npx/1106a35d869e25fb/node_modules/.bin:$PATH" AI1_PACKAGED_RESOURCES="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app" AI1_E2E_EXECUTABLE="$PWD/applications/electron/dist/mac-arm64/AI1.app/Contents/MacOS/AI1" npm run test:e2e --workspace e2e -- editor-release.spec.ts --workers=1 --output=/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-editor-worker-ui/final
```

## Validation limits and owner inputs

React checks use the real installed type declarations. They do not execute React
or test a framework build. React Native is not installed. Its check uses a small
declaration fixture, not the framework, Metro, Expo, or platform type selection.
The Electron test uses React JSX in both named projects. Its `mobile` folder name
does not establish React Native support.

Compiler API and server checks do not prove extension-host or editor behavior.
The rebuilt packaged Electron result covers the fixtures' stated command,
pointer-hover, editor-save, and sanitizer checks. It does not verify a future
package, native Omarchy execution, or the owner's project.

The owner must supply these inputs for the reported VS Code difference:

- The approved workspace and project paths, checkout, and affected files.
- The saved file content and a reproducible dependency installation.
- The relevant configuration files, including inherited configurations.
- The selected TypeScript version and project in each editor.
- The VS Code extensions and settings needed for the comparison.
- The current AI1 build and expected diagnostics or hover content.

Then compare both editors with the same TypeScript version, configuration,
dependencies, and file content. Record project selection, library paths, and
extension-host logs. Keep real errors visible. Do not change the owner's code
or compiler settings to hide differences.

No external repository, installed app, global setting, or shared package file
changes in this lane. No commit, push, or publication forms part of this work.
