# AI1 future milestone: WSL2 with WSLg

Date: 2026-09-30
Status: future backlog; draft for owner review; not approved for implementation.
Extends: [AI1 design](2026-09-21-ai1-design.md).

## Goal and status

Run AI1 as a Linux Electron app inside WSL2. Use WSLg to show its windows on
the Windows desktop. Keep the app, tools, and projects in one distribution.
Do not add a native Windows front end or a remote back end.

This document adds requirements, not support. The current review runs on macOS.
No WSL build, launch, graphics, or integration test runs as part of this review.
All WSL execution results remain unverified.

The main design holds the future milestone. The local
`.superpowers/sdd/2026-09-23-ai1-m2-backlog/progress.md` ledger covers a completed,
bounded M2 task. It is not a general product backlog. Do not append this work to
that completed task. Make a new implementation plan only after owner review.

## User stories

1. As a Windows user, I open AI1 through WSLg and edit my Linux projects without
   a Windows-to-Linux tool bridge.
2. As a developer, I get the same explorer, changes, diffs, TypeScript support,
   and ESLint fixes as on macOS.
3. As an agent user, I start Linux OpenCode sessions and tmux terminals in the
   project folder. They continue when I close AI1 while WSL remains active.
4. As a browser user, I open a development server in the same distribution. I
   use Control shortcuts when the page has keyboard focus.
5. As an owner, I get clear prerequisite and platform errors. AI1 does not
   install tools, change Windows settings, or reduce security without my action.
6. As a maintainer, I build a Linux package from the pinned dependencies. Linux
   changes do not break the macOS package or Command shortcuts.

## Supported environment and architecture

These are requirements for the future support contract. They are not a claim
that any distribution or CPU target passes today.

| Item | Requirement |
| --- | --- |
| Windows host | A Windows version with official WSLg support. The exact AI1 minimum remains an owner decision. Microsoft lists Windows 10 build 19044+ or Windows 11 [R1]. |
| WSL | WSL2 with WSLg enabled and current supported WSL components. WSL1 does not meet the requirement. Record the tested WSL and WSLg versions. |
| Distribution | One Linux distribution for the app, projects, and tools. The owner selects the first distribution and version. Do not claim all distributions. |
| CPU | The owner selects x64, arm64, or both. Build and test each selected Linux architecture. Do not infer support from macOS arm64. |
| User | A normal Linux user. Do not launch AI1 as root. |
| Display | The WSLg X11 or Wayland environment. Prove one default display path before selecting it. Do not require a separate X server or a full Linux desktop. |
| Projects | Linux paths in that distribution. Recommend `/home/<user>/code`. Mounted Windows drives have limited support as specified below. |
| Runtime | The pinned Electron runtime ships with the app. Linux Git, tmux, and OpenCode v2 run in the distribution. |
| Source build | Linux Node 24, npm, Python, and the selected distribution's C/C++ and native-library build prerequisites. Keep the lockfile and pinned Theia versions. |
| Network | App services communicate within WSL. NAT is the initial validation mode. Validate mirrored mode separately if it is included in the support contract. |

```text
Windows desktop
  WSLg: windows, input, clipboard, display transport
    one WSL2 distribution, one Linux user
      Linux Electron main process
        Theia IDE renderer + Linux Node back end + extension host
        isolated Electron browser guests + authenticated page-only CDP proxy
      Linux Git, OpenCode service, tmux, project servers
      Linux project files and Linux app state
```

WSLg transports the display. It does not make this a Windows Electron process.
Platform checks in the app see `linux`. Use normal Linux behavior where possible.
Use a WSL-specific check only for a WSL-specific limit or help message.
Do not make extension packages depend on each other to share platform logic.

Closing AI1 does not stop tmux or OpenCode. WSL termination, `wsl --shutdown`,
Windows restart, and distribution removal can stop those processes. Do not
promise process survival across those events. OpenCode's stored session data
has a separate lifetime from its running process.

## Scoped feature matrix

| Feature | Future WSL scope | Required limit or proof |
| --- | --- | --- |
| Explorer, changes, diffs, search | Required | Linux case-sensitive paths, symlinks, Git status, rename and discard rules. Test discards only in disposable fixtures. |
| TypeScript, ESLint, Material icons | Required | Bundled extensions load in the Linux extension host. Save fixes and go-to-definition work. |
| OpenCode v2 | Required | Resolve a Linux executable. Read same-user Linux service state and credentials. Test service start and reconnect. |
| Terminals and tmux | Required | PTY creation, resize, detach, reattach, shell PATH, and persistence after app close. |
| Browser tabs and profiles | Required | Guest isolation, HTTPS, local server access, persistent login, history, downloads, popups, zoom, find, and profile deletion. |
| Agent browser access and design mode | Required | Existing page-only authenticated CDP boundary stays intact. No IDE target becomes available. |
| Ports view and Stop Server | Required | Inspect Linux processes only. Preserve workspace and owner checks. Never stop a Windows process. |
| Keyboard and clipboard | Required | Control on Linux, Command on macOS. Test IDE, terminal, and guest focus separately. |
| Update notices | Required | No Homebrew checks on Linux. Show supported sources or an explicit unavailable state. |
| Automatic Linux tool installation or update | Not included in initial scope | Show manual guidance. A future updater needs a separate approved tool-source policy. |
| Cookie import from external browsers | Not included in initial scope | Disable it with a platform explanation. Normal login inside an AI1 profile remains required. |
| `/mnt/c` workspaces | Limited | Permit Linux paths but warn about performance and watcher limits. No performance promise or Windows executable support. |
| Start menu and desktop launcher | Conditional | The owner selects whether packaging includes desktop integration. Shell launch remains required. |
| Windows browser profile, keychain, and tools | Not supported | Do not read Windows credential stores or use Windows executables as a fallback. |

The macOS cookie import and Homebrew updater remain available on macOS.
The owner must approve the WSL exclusions before implementation.

## Source audit

The audit reads the worktree on 2026-09-30. Other feature work is in progress.
Recheck these files at implementation start. A confirmed blocker means source
code prevents the stated behavior. It does not mean a WSL test fails.

### Confirmed platform gaps

| Evidence | Confirmed gap | Required change |
| --- | --- | --- |
| `applications/electron/electron-builder.yml` | Only a macOS arm64 directory target exists. No Linux target or install contract exists. | Add the selected Linux targets without changing macOS signing rules. |
| `scripts/package-mac.sh` | The script selects `--mac --arm64`, runs `codesign`, and installs with `ditto` into `/Applications`. It exports `/usr/bin/cc` and `/usr/bin/c++`. | Add a separate Linux package flow. Check Linux compiler and library prerequisites. Do not reuse macOS signing or install steps. Fixed compiler exports are a portability assumption, not proof that Linux compilation fails. |
| `applications/electron/scripts/generate-app-icon.mjs` and `render-app-icons.swift` | Icon generation uses Swift/AppKit, `sips`, and `iconutil`. A Linux-only build cannot use those macOS tools. | Use reviewed PNG/SVG Linux assets or a portable generation step. Do not require a Mac to build Linux packages. |
| `extensions/browser-pane/src/common/shortcuts.ts` | `shortcutFor` rejects Control and accepts Meta. A focused Linux guest cannot use the required Control shortcuts through this handler. | Select the primary modifier by platform. Match Theia bindings and preserve unhandled page input. |
| `extensions/agents/src/node/opencode-client.ts` | Missing-program guidance gives Homebrew commands. | Give Linux guidance for the selected distribution and verified OpenCode v2 source. Never suggest an unverified package that installs OpenCode v1. |
| `extensions/updater/src/node/updater-service.ts` | Tool checks and apply actions are macOS-only. `ai1RootFrom` also rejects non-macOS platforms. | Add Linux source-check behavior where safe. Report manual tool updates or unavailable sources. Do not call Homebrew or silently skip all update status. |
| `extensions/browser-pane/src/electron-main/cookie-import.ts` | Source detection returns no profiles off macOS. Import uses `/usr/bin/security` and macOS Keychain decryption. | Explicitly gate UI and IPC on Linux. Do not present an empty list as successful platform support. |

### Existing behavior to preserve, with unverified Linux risks

| Evidence | Current behavior | Linux proof or risk |
| --- | --- | --- |
| `extensions/agents/src/common/find-on-path.ts` and `src/node/resolve-program.ts` | Use Node path delimiters, absolute PATH entries, regular-file checks, and execute permissions. | This is Unix-compatible source, not a confirmed macOS blocker. Prove shell and launcher PATH behavior. Reject Windows executables or wrappers that delegate required tools to Windows. Do not reject all `/mnt` paths without a reason. |
| `extensions/agents/src/node/tmux-runner.ts` | Uses `tmux new -A -s`, optional `-c`, and `tmux ls -F`. The list call resolves its name through PATH and merges stdout/stderr. | Test Linux output, missing tools, permission failures, and socket failures. Do not treat every failure as an empty session list. Keep user tmux sessions and configuration unchanged. |
| `extensions/agents/src/node/opencode-client.ts` | Reads `XDG_STATE_HOME` or `~/.local/state/opencode/service.json`, with a legacy config fallback. | Preserve lookup order, stale-state handling, same-user process checks, and credential privacy. Test custom XDG paths and a service restart on a new URL. |
| `extensions/browser-pane/src/node/ports-service-impl.ts` | Runs `lsof` field-output scans and `ps -o uid= -p`. Resolves workspace roots with real paths. Rescans port/workspace membership and checks UID before `SIGTERM`. | Verify Linux `lsof`, procps output, inaccessible cwd, IPv4/IPv6, and process races. Missing metadata must fail closed. Linux support must not weaken existing stop protections. |
| `extensions/browser-pane/src/browser/browser-contribution.ts`, `extensions/agents/src/browser/agents-contribution.ts`, and shell layout bindings | Theia uses `ctrlcmd` bindings. | These bindings already express platform selection. Test guest forwarding and terminal conflicts rather than replacing them with Meta or Control everywhere. |
| `applications/electron/scripts/ai1-electron-main.js` | Plugin and icon paths are relative to the app. Dock/appearance behavior is inside a `darwin` guard. | Keep the guard. Prove asset paths in Linux development and installed packages. No macOS Dock behavior is required in WSL. |
| `extensions/browser-pane/src/electron-main/browser-main-contribution.ts` | Profile, history, zoom, and download stores use Electron `userData`. | Verify Linux location, profile isolation, file permissions, restart, and custom test user data. Do not assume every store belongs in `XDG_STATE_HOME`. |
| `agent-address-server.ts`, `one-page-proxy.ts`, `guest-policies.ts`, and `theia-sender.ts` in browser-pane electron-main | Loopback address with secret path, page-only proxy, isolated guests, and trusted IPC sender guards. | Prove the same limits under WSL networking. Loopback is not a guarantee that Windows host processes cannot connect. |
| `package-lock.json`, Electron app rebuild scripts, and root plugin pins | Native dependencies include `node-pty`, `native-keymap`, `keytar`, and platform-specific ripgrep packages. Builds use `theia rebuild:electron`. | Verify Linux architecture, Electron ABI, system libraries, executable permissions, and runtime loading. Inventory any SQLite native use in cookie tooling. WSLg does not guarantee a keyring or D-Bus desktop session. |
| Changes-view file events and Theia filesystem dependencies | Linux filesystem support comes from Theia and its dependencies. | Measure watcher count, burst handling, external edits, and inotify limits. `/mnt/c` can differ in speed, permission, case, and notification behavior [R2]. |

## Prerequisites and install flow

The future launch guide must separate Windows host steps from Linux steps.
It must give exact commands only for the selected support targets.

1. On Windows, check `wsl --version`, `wsl --status`, and `wsl --list --verbose`.
   Record the host build and distribution. The target distribution must use
   version 2. Use official WSL install or update guidance [R1].
2. Explain that `wsl --shutdown` stops all active WSL distributions and their
   processes. Do not put it in an automatic installer or routine launch script.
3. Check the Windows GPU driver and WSLg display support. In the target
   distribution, confirm `DISPLAY`, `WAYLAND_DISPLAY`, and `XDG_RUNTIME_DIR`
   as applicable. Prove that a simple GUI app opens before diagnosing AI1.
   Do not overwrite these variables with an old external X-server recipe.
4. In Linux, verify the selected package's shared-library prerequisites. For
   source builds, verify Linux Node 24, npm, Python, compiler tools, and native
   development libraries. Record exact distribution package names after proof.
5. Install Linux Git, tmux, and the supported OpenCode v2 release by explicit
   user action. Show version checks. AI1 does not run `sudo` to install them.
6. Put the checkout and projects under the Linux home folder. Do not share
   `node_modules` between Windows, macOS, Linux, or different CPU architectures.
7. For a source build, use `npm ci`, `npm run download:plugins`, and the Linux
   production build/package flow. The current macOS package script is not a
   Linux instruction. Document the new package command when it exists.
8. For an installed build, verify the artifact checksum and architecture.
   Use the approved package or per-user install flow. Do not replace app data.
9. Launch from the target distribution as the normal user. The entry point
   checks required display/runtime conditions and reports a useful error.
   The owner selects the final launcher name and artifact format.
10. Open a Linux workspace. Verify the Agents and Ports prerequisites. Missing
    optional tools disable only their functions, not the editor.

Desktop launch must not depend on an interactive shell startup file by accident.
Prove how Theia's generated PATH setup works on Linux. If a launcher needs PATH
configuration, document it. Do not modify shell files or global PATH silently.

## Platform behavior and errors

| Condition | Required behavior |
| --- | --- |
| WSL1 or missing WSLg display | Stop the unsupported launch with a clear requirement and official help URL. If Electron exits before UI creation, write the error to stderr. Do not guess WSLg health from one environment variable. |
| Missing runtime library or wrong architecture | Identify the missing library or architecture from safe diagnostics. Give the selected distribution's remedy. Do not recommend `--no-sandbox`. |
| Root launch | Reject the supported launch path. Explain that AI1 requires a normal Linux user. |
| Missing Git, tmux, OpenCode, `lsof`, or `ps` | Name the missing Linux tool and affected feature. Give verified guidance. Keep independent features available. |
| OpenCode service absent, stale, or unauthorized | Keep existing start/retry behavior. Identify the Linux service file when useful. Never print its password. Test restart and changed-port recovery rather than assuming it works. |
| tmux socket denied or command fails | Show the command failure separately from no sessions. Do not remove or reset the user's tmux server. |
| Unknown port owner or cwd | Show available scan data if safe. Disable Stop Server for the uncertain row. Do not escalate privileges. |
| Browser connection, certificate, or proxy failure | Use the existing browser error and retry behavior. Keep certificate exceptions explicit and scoped. Do not turn off TLS verification. |
| Mounted Windows workspace | Show a non-blocking location warning once per selected workspace. Recommend Linux storage. Do not move files or change mount settings. |
| Watch limit reached or watcher unavailable | Report the error and retain manual refresh. Give verified, optional host guidance. Do not change kernel limits or enable broad polling silently. |
| Linux update source unavailable | Show installed version if known and manual guidance. Do not report "up to date" without a successful comparison. |
| Cookie import on Linux | Explain that external browser cookie import is not supported. Offer normal login in the selected AI1 profile. Reject unsupported import IPC even if a caller bypasses the UI. |
| WSL stops | Explain process lifetime limits in help. On next launch, recover saved app state and reconnect or start tools safely. Do not promise a live shell survives. |

### Files, settings, and XDG locations

- Use Linux path and URI handling. Do not auto-convert `C:\\...` or UNC paths
  into supported workspace paths. Let the user choose a Linux folder.
- Preserve Linux filename case. Use argument arrays, not interpolated shell
  commands. Test spaces, Unicode, symlinks, and leading-dash filenames.
- Keep Theia's configuration override and Electron's user-data override working.
  Resolve their actual Linux defaults before writing the launch guide.
- Respect supported XDG config, data, state, cache, and runtime variables where
  the owning library uses them. Do not force all app storage into one variable.
- Keep app profiles and tool state in the distribution. Do not sync Windows or
  macOS credentials, cookies, or configuration automatically.
- Use owner-only permissions for secrets and temporary credential data. Test
  permission errors and non-default home/XDG folders.
- Keep installed application files separate from user data. Uninstall must not
  delete projects, tmux sockets, OpenCode state, or browser profiles silently.

### Keys, graphics, and file watching

Use Control as the Linux primary modifier and Command as the macOS modifier.
Test find, next/previous match, address focus, zoom, reopen tab, new terminal,
explorer toggle, tab selection, and terminal split actions. Handle Shift and
keyboard-layout differences. Do not consume AltGr or unrelated page shortcuts.
Keep terminal `Ctrl+C` as interrupt and terminal copy/paste behavior correct.
Use the same command definitions for IDE and guest focus where practical.

Test native-keymap loading, a non-US layout, clipboard in both directions,
IME input, scaling, window resize, and focus changes through WSLg. Windows
reserved shortcuts are not under AI1 control. Document any measured conflict.

Select the default X11/Wayland path from actual tests with the pinned Electron
version. Keep hardware acceleration as the normal path if it passes. An explicit
software-rendering diagnostic may help identify a GPU issue. It must not disable
the sandbox, change system settings, or become an unexplained default.

Measure watcher behavior in `/home` first. Compare a disposable fixture on
`/mnt/c` only with owner permission. Record file count, repository count,
refresh latency, missed events, CPU load, and watch errors. Do not promise equal
performance or change user projects to make a test pass.

## Security and networking constraints

1. Keep browser guests sandboxed, context-isolated, and without Node integration.
   Keep guest permission, navigation, popup, download, and IPC sender rules [R4].
2. Do not enable global Electron remote debugging. The agent proxy exposes
   only the assigned browser page. It never exposes the IDE, other profiles,
   unrelated tabs, extension host, or Electron main process.
3. Keep the proxy on `127.0.0.1`, with its existing secret and Host checks.
   Do not bind `0.0.0.0`, add port forwarding, or change firewall policy for AI1.
4. Test unauthorized HTTP and WebSocket access, missing/wrong secrets, invalid
   Host and Origin where applicable, and forbidden target requests. Keep secret
   URLs out of screenshots, logs, error messages, and release reports.
5. WSL can expose Linux loopback services to Windows through localhost access
   [R3]. Treat host processes as possible clients. WSLg and loopback do not
   replace authentication. Do not claim isolation from a hostile same-user
   process that can read the user's files or app memory.
6. Keep OpenCode credentials local to the Linux user. Do not read a Windows
   service file or silently connect to an unauthenticated service on Windows.
7. Ports scanning and process termination stay in Linux. Recheck listening
   port, canonical workspace membership, and UID before Stop Server. Deny
   invalid, disappeared, unrelated, foreign-owner, or unknown-owner processes.
   Use `SIGTERM` only. Do not use `sudo`, Windows task termination, or broad kills.
8. Review the race between the scan and signal. Linux support must not widen
   it. Test PID replacement with a controlled runner. If process identity cannot
   be established safely, fail closed and document the remaining limitation.
9. NAT and mirrored networking have different host reachability [R3]. Same-distro
   servers are the required path. Do not infer that Linux `localhost` reaches a
   Windows server in NAT mode. Explicit Windows-host URLs are user input, not
   automatic tool discovery or a supported Windows process-control path.
10. Keep TLS, certificate, DNS, proxy, and login behavior within the existing
    boundaries. Prove loopback bypass where necessary. Do not send local service
    credentials through an external proxy or disable TLS to handle a VPN issue.
11. Do not add Windows cookie decryption, DPAPI access, macOS Keychain access,
    or plaintext credential-storage fallbacks. Test Linux Electron/keytar
    behavior with and without a keyring. Ask for a separate decision if secure
    persistence needs a new prerequisite.

## Packaging, build, release, and CI

- Keep Theia `1.75.0`, Electron `42.8.1`, and electron-builder `26.0.0` for the
  first compatibility probe. Do not upgrade them silently to obtain Linux
  support. A required upgrade gets its own compatibility review.
- Build on Linux for each selected architecture. Use a clean Linux dependency
  tree and `theia rebuild:electron` for the pinned Electron ABI [R5]. Do not copy
  macOS native binaries. Keep caches separate by OS, architecture, and ABI.
- Inventory `.node` files and bundled executables. Verify PTY, native keymap,
  keytar, filesystem watcher dependencies, ripgrep, and any SQLite dependency
  in the installed app. Record required runtime and build libraries.
- Keep the relative bundled plugin and Material icon layout. Verify production
  packaging includes scripts, generated back end, plugins, resources, and all
  required Linux native files. Linux assets do not require Swift or `.icns`.
- `npmRebuild: false` currently relies on the preceding Theia rebuild. Prove
  that the Linux package contains the rebuilt files. Do not disable rebuilds
  simply to make packaging finish.
- The owner selects directory/tar archive, `.deb`, AppImage, or other formats.
  Do not promise every format. Test any sandbox-helper permissions or AppImage
  mount prerequisites for the chosen format. Do not use `--no-sandbox` as a fix.
- Define source-build, install, upgrade, rollback, and uninstall instructions.
  Use a staged artifact replacement. Do not overwrite source or user data.
  Do not publish or install anything as part of specification work.
- Label artifacts with version, `linux`, and architecture. Produce checksums
  and a dependency/license manifest. Follow the repo's private release model
  unless the owner approves broader distribution or signing.
- Add Linux lint, typecheck, unit, production build, packaging, and hidden
  Electron end-to-end gates. Keep macOS gates. A Linux VM/container or Xvfb
  run is useful but is not a WSLg validation result.
- Actual WSLg manual validation remains a release gate. A Windows WSL runner
  can automate it only after runner ownership and GUI session access are clear.
  Do not add an unsupported hosted-runner claim to CI.
- Existing end-to-end tests use `AI1_E2E_BACKGROUND=1` and isolated data. Keep
  them hidden. Use a separate, owner-approved manual session for visible WSLg
  graphics checks. Never launch tests against the owner's normal app data.

## Validation matrix

Every selected distribution/CPU combination needs an actual WSL result.
Record commit, artifact checksum, host build, WSL/WSLg versions, distribution,
kernel, CPU, GPU driver, display path, network mode, and workspace location.
Record failures as failures or exclusions. Do not mark an unrun row as passed.

| Layer | Checks | Required evidence |
| --- | --- | --- |
| Pure/unit tests | Platform modifiers; prerequisite messages; updater capabilities; XDG lookup; Linux `lsof`/`ps` fixtures; stop safety; unsupported import IPC | Linux and macOS test output with positive and negative cases. |
| Linux build/package | Clean dependency install, native rebuild, production package, native load, plugins/assets | Logs and artifact manifest for each supported architecture. |
| Hidden Linux end-to-end | Editor, changes, terminals, browser, profiles, downloads, design mode, update state | Isolated test output; no leaked test processes or real user data changes. |
| Actual WSLg happy path | Shell launch, chosen desktop launch, display, keyboard, clipboard, local server, OpenCode, tmux | Repeatable manual run below on each support target. |
| Actual WSLg security | Sandbox, IPC, CDP target limits, host localhost clients, Stop Server denial | Sanitized positive/negative results. No tokens in evidence. |
| Actual WSLg failure path | Missing tools/display; bad permissions; closed server; service restart; wrong architecture; keyring absent | Useful errors and unaffected independent features. |
| Storage/performance | `/home` baseline, optional `/mnt/c` comparison, external edits, burst changes, watch limits | Counts and measured latency/CPU. No unsupported performance claim. |
| macOS regression | Existing package, icon generation, Command shortcuts, cookie import, Homebrew updates | Existing gates and selected smoke checks still pass. |

### Repeatable actual WSL manual checks

Use a disposable Linux user or isolated test home, Electron user-data folder,
and `THEIA_CONFIG_DIR`. Use a dedicated OpenCode test state/config folder where
the supported tool permits it. Name all created sessions with `ai1-probe-`.
Use temporary test repositories. Do not touch real projects or sessions.
Record each step and expected result in the future validation report.

1. Record the environment listed above. Confirm WSL2 and a working simple WSLg
   GUI app. Launch the packaged AI1 as the normal user without sandbox bypass.
   Expect a visible, usable IDE and no native-module load error.
2. Create a meta-repo fixture with two sibling Git repositories, TypeScript,
   and ESLint. Include spaces, Unicode, symlinks, and case-distinct names.
   Expect the correct explorer icons, search, autocomplete, go-to-definition,
   and ESLint fix on save.
3. Make tracked, untracked, renamed, deleted, and staged changes. Expect correct
   changes rows and diffs. Exercise confirmed discard actions only in the
   fixture. Expect unrelated and ignored files to remain intact.
4. Start a tmux test terminal in the fixture. Print its cwd and Linux process
   identity. Resize and split it. Close and reopen AI1. Expect the same live
   tmux session while WSL remains active. A shell interrupt still works.
5. Start or attach an isolated OpenCode v2 test service. Create one test session.
   Expect correct status and project grouping. Stop and restart only this
   service, including a changed URL where supported. Expect useful recovery,
   or a recorded defect that blocks the stated reconnect criterion.
6. Start a Linux HTTP fixture bound to `127.0.0.1` under a fixture repository.
   Expect the Ports view to group it and the browser to load it. Stop it by
   explicit action. Expect only that same-user fixture process to receive
   `SIGTERM`.
7. Test a server outside the workspace, a closed/replaced process, and a
   foreign-owner fixture created only in an approved test environment. Expect
   Stop Server to refuse each unsafe case. Test missing `lsof`/`ps` through
   controlled PATH fixtures. Never target a real system or user process.
8. Focus the IDE, terminal, and browser guest in turn. Check the specified
   primary-modifier actions, Shift variants, terminal interrupt/copy/paste,
   a non-US layout, and AltGr. Expect one action per shortcut and normal page
   input for keys that AI1 does not handle.
9. Use two disposable browser profiles and a local login fixture. Expect
   separate cookies, history, and downloads. Restart AI1 and check persistence.
   Delete one profile. Expect its storage to clear without changing the other.
   Check find, zoom, popups, design selection, viewport, and DevTools.
10. Give one browser tab to an agent through the existing CDP route. Expect
    only that page. Reject wrong/missing secrets, invalid target requests,
    and IDE targets. Check from Linux and a Windows localhost client in each
    supported network mode. Do not expose an external listening address.
11. Check sandboxed guest preferences and absence of Node access. Check IPC
    rejection from an untrusted guest. Verify no global remote-debugging port.
    Test profile login persistence without a keyring and record the secure
    outcome. Do not save real credentials in this test.
12. Copy text between Windows and AI1 in both directions. Check IME, scale,
    resize, focus, and browser rendering. Record GPU behavior. If rendering
    fails, collect sanitized WSLg/Electron diagnostics without disabling safety.
13. Edit fixture files from an external Linux process. Apply a burst of changes.
    Expect explorer and Changes refresh. Measure the `/home` baseline. With
    permission, repeat on a disposable `/mnt/c` fixture and check the warning.
14. Run update checks and invoke unsupported cookie import. Expect Linux manual
    guidance, no Homebrew/Keychain command, no install, and no false success.
    Repeat launch with missing tool, denied state folder, and missing display
    fixtures. Expect the specified errors.
15. Upgrade or replace the test package using the selected install procedure.
    Expect user state and projects to remain intact. With explicit owner
    permission, stop the test distribution and relaunch it. Expect saved state
    recovery, not a promise of live tmux process survival.
16. Remove only fixture files and `ai1-probe-` sessions created by this run.
    Check for remaining test Electron, extension-host, HTTP, tmux, and OpenCode
    processes. Do not kill shared servers or remove real app data.

Repeat the happy path from a clean test state twice on each target. Keep
graphics checks separate from the hidden automated suite. Approve performance
thresholds with the owner after the first measured baseline.

## Concrete success criteria

The milestone is complete only when all of these are true:

1. The owner approves the support targets, artifact formats, and scoped feature
   exclusions. The launch guide states exact supported versions and CPUs.
2. A clean Linux build and package use no macOS tools or copied macOS native
   files. Each selected architecture loads its required native modules.
3. An actual WSL2/WSLg host launches the packaged app as a normal user without
   `--no-sandbox`, global debugging, or firewall changes.
4. All required feature-matrix rows pass in the target distribution. Mounted
   Windows paths and excluded features show their documented limits.
5. Browser Control shortcuts work with guest focus. macOS Command shortcuts
   still work. Terminal interrupts and unhandled page input remain correct.
6. tmux and OpenCode function in the same distribution. They survive app close
   while WSL runs. Stale service state and restart behavior match the contract.
7. Port scanning works with Linux tools. Stop Server denies unknown, foreign,
   unrelated, invalid, and replaced processes. No test changes a real process.
8. Browser profiles persist and stay isolated. CDP exposes only the assigned
   page. Negative authentication, target, IPC, and sandbox checks pass.
9. Linux update status is accurate. AI1 does not run Homebrew, Keychain tools,
   `sudo`, tool installers, or Windows tool fallbacks on Linux.
10. The fixture watcher test has no missed changes under the approved `/home`
    workload. The report gives measurements and explicit `/mnt/c` limitations.
11. Markdown format, lint, typecheck, unit, production build, and relevant hidden
    end-to-end gates pass. The macOS regression gates pass.
12. Two clean actual WSL manual runs pass per supported target. The report
    includes environment details and sanitized evidence. Unrun configurations
    remain unsupported, not implicitly passed.

## Implementation slices, in dependency order

Each slice needs its own reviewed plan and tests. No implementation starts
from this draft without approval.

1. **Support decisions and compatibility probe.** Resolve target distribution,
   CPU, host minimum, formats, and test machine. On actual WSLg, prove the pinned
   runtime, native rebuild, GUI launch, sandbox, keyring behavior, and one PTY.
   Exit: evidence identifies a viable secure build and display path. Any required
   dependency upgrade or credential-storage change gets a separate decision.
2. **Linux build and launch path.** Add target-specific packaging and portable
   assets. Add documented prerequisites, normal-user checks, and safe install
   layout. Exit: a clean selected Linux target builds and launches without macOS
   tools. Preserve the macOS package.
3. **Tool discovery and Linux state.** Add platform install guidance, Linux
   executable checks, XDG tests, PATH launch tests, and tmux failure behavior.
   Exit: isolated Git, tmux, and OpenCode run in the correct project with safe
   stale-state and reconnect behavior.
4. **Linux ports and process safety.** Add Linux output fixtures and real fixture
   checks. Review identity races and denial paths. Exit: scans work and unsafe
   stop requests fail closed. Do not replace proven Unix logic without evidence.
5. **Input and display integration.** Add platform primary-modifier selection
   at the guest boundary. Check Theia keymaps, PTY keys, clipboard, layout, IME,
   and scaling. Exit: Control and Command behavior pass their respective tests.
6. **Browser and platform capabilities.** Prove guest/profile/CDP security and
   Linux networking. Gate cookie import and Homebrew actions. Add truthful
   Linux update notices and safe source-check behavior. Exit: required browser
   functions pass and unsupported actions cannot run through IPC.
7. **Filesystem and package hardening.** Prove bundled plugins, native modules,
   XDG permissions, watchers, chosen launcher, upgrade, and uninstall behavior.
   Exit: installed package and source build meet the same contract.
8. **Release validation and support guide.** Add Linux automated gates. Run the
   full actual WSL matrix twice per target. Run macOS regression gates. Publish
   a sanitized validation report and the approved launch guide. Exit: all success
   criteria pass before the milestone changes from backlog to supported.

## Non-goals

- A native Windows Electron app with Linux tools behind a bridge.
- WSL1, third-party X-server setup, SSH, containers, or remote workspaces.
- Cross-distribution project, credential, process, or tmux coordination.
- Automatic Windows path conversion or Windows executable discovery.
- Windows process scanning, termination, browser-cookie import, or DPAPI access.
- General Linux distribution support beyond the tested target matrix.
- Automatic package-manager updates, privileged install, or WSL configuration.
- System-wide sandbox bypass, firewall changes, or a global debugging endpoint.
- Process survival across WSL shutdown or Windows restart.
- Public distribution, signing, or an upstream dependency upgrade without a
  separate owner decision.

## Open decisions for the owner

These questions block the relevant implementation plan. They do not block adding
the work to the backlog.

1. Which distribution and exact version form the first support target?
2. Which CPU targets are required: Linux x64, arm64, or both?
3. Is Windows 11 the AI1 minimum, or is Windows 10 build 19044+ required too?
4. Which artifact/install formats are required? Is a per-user shell launch
   sufficient, or must the first release include Start menu integration?
5. Does the owner approve manual Linux tool updates and no external cookie import
   for the first milestone? Which OpenCode v2 install source is supported?
6. Does the owner require `/mnt/c` correctness beyond the stated limited mode?
   What representative project size and refresh target must `/home` support?
7. Must mirrored networking, corporate proxy/VPN, and Windows-host development
   servers be supported, or only same-distribution servers with NAT first?
8. Which actual Windows/WSLg machine and GPU are available for validation?
   Who approves visible manual GUI tests and any distribution restart?
9. If secure keyring persistence needs a Linux keyring service, is that an
   acceptable prerequisite? No plaintext fallback is implied.
10. What release visibility, artifact retention, and CI runner model are required?

## Official references

All references are read on 2026-09-30. They describe upstream behavior, not an
AI1 compatibility test. Recheck them when implementation starts.

- **R1 — Microsoft: Run Linux GUI apps with WSL.**
  <https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps>
  The fetched page reports an update on 2026-06-02. It lists Windows host
  prerequisites, WSL2-only GUI support, X11/Wayland, GPU drivers, clipboard,
  and desktop integration. WSLg is not a full Linux desktop.
- **R2 — Microsoft: Working across file systems.**
  <https://learn.microsoft.com/en-us/windows/wsl/filesystems>
  The fetched page reports an update on 2026-06-02. It recommends Linux storage
  for Linux tools and describes file case and Windows executable interoperation.
- **R3 — Microsoft: Accessing network applications with WSL.**
  <https://learn.microsoft.com/en-us/windows/wsl/networking>
  The fetched page reports an update on 2026-06-02. It describes NAT, Windows
  localhost access to Linux services, mirrored networking, DNS, proxy, and
  firewall behavior. These modes need separate security checks.
- **R4 — Electron: Security.**
  <https://www.electronjs.org/docs/latest/tutorial/security>
  No publication date appears in the fetched page. It requires isolation,
  sandboxing, restrictive remote-content handling, and IPC sender validation.
  The latest guide is not proof for the pinned AI1 runtime.
- **R5 — Eclipse Theia: Build your own IDE/Tool.**
  <https://theia-ide.org/docs/composing_applications/>
  The page states "Last updated: September 8, 2026". It describes the Electron
  application target, native rebuild requirement, and esbuild in Theia 1.75.
  Its illustrative dependency versions are not AI1's support contract.
