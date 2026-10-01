# AI1 WSL validation record

Date: 2026-09-30
Target: the owner's existing Ubuntu 26.04.1 x64 PC, WSL2 with WSLg, `.deb` package.
Status: Linux setup is deferred. Source groundwork is tested on macOS. AI1 is not tested on WSL yet.
Plan: [compatibility probe](2026-09-30-ai1-wsl-compatibility-probe.md).

## Windows environment

Evidence: owner-provided PowerShell output on 2026-09-30.

| Item                       | Reported value                                             |
| -------------------------- | ---------------------------------------------------------- |
| Windows edition            | Windows 11 Home                                            |
| Windows version            | `10.0.26200.9457` from WSL; `10.0.26200` from the OS query |
| Windows build              | `26200`                                                    |
| OS architecture            | 64-bit; Linux reports `x86_64`                             |
| WSL                        | `2.7.14.0`                                                 |
| Kernel                     | `6.18.33.2-2`                                              |
| WSLg                       | `1.0.73.2`                                                 |
| MSRDC                      | `1.2.7214`                                                 |
| Direct3D                   | `1.611.1-81528511`                                         |
| DXCore                     | `10.0.26100.1-240331-1435.ge-release`                      |
| Selected distribution name | `Ubuntu`                                                   |
| Distribution state         | Running                                                    |
| Distribution WSL version   | 2                                                          |

The report also lists a stopped `docker-desktop` distribution. It is not an
AI1 test target. Do not start, stop, or change it as part of these checks.

## Linux environment

Evidence: owner-provided Ubuntu terminal output on 2026-09-30.

| Item              | Reported value                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Distribution      | Ubuntu 26.04.1 LTS, Resolute Raccoon                                                                    |
| CPU architecture  | `x86_64`                                                                                                |
| User ID           | `1001`, not root                                                                                        |
| Current directory | `/mnt/c/Users/<user>`                                                                                   |
| Display           | `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`                                                               |
| Node              | `node` command not found                                                                                |
| npm               | `11.3.0`; resolves through Windows NVM at `/mnt/c/nvm4w/nodejs/npm`. Do not use it for the Linux build. |
| Git               | `2.53.0`                                                                                                |
| Python            | `3.14.4`                                                                                                |
| C compiler        | `cc` command not found                                                                                  |
| tmux              | `3.6`                                                                                                   |
| lsof              | `/usr/bin/lsof`                                                                                         |
| ps                | `/usr/bin/ps`                                                                                           |

The owner selects this existing PC as the first target. This replaces the earlier
Ubuntu 24.04 choice. No additional distribution is required.

Use a separate checkout under the Linux home directory for the build. Do not
share Windows dependencies or change the owner's mounted Windows files.

## Pending Linux checks

- Linux Node and npm must replace Windows npm for the build shell.
- Linux Node 24, compiler, and native build/runtime libraries.
- Python 3.14 compatibility with the pinned native build toolchain.
- A working GUI app, pinned Electron launch, native modules, PTY, and sandbox.
- Keyring behavior and secure profile persistence.
- Clean Linux build, `.deb` packaging, and installed-app checks.

Installed WSLg is not proof of AI1 graphics or sandbox compatibility.
No Linux build, app launch, or feature check has a passing result yet.

## Build prerequisite findings

The owner's follow-up check confirms no Linux `node`, `nodejs`, or `nvm` command.
Windows npm resolves to the Windows user's NVM installation. The Ubuntu package
query reports these build packages as absent:

- `build-essential`
- `pkg-config`
- `libsecret-1-dev`
- `libx11-dev`
- `libxkbfile-dev`

Next step: the owner installs Linux build packages and Linux Node 24. Keep
Windows NVM unchanged. Keep the Linux Node installation under the Linux home
directory. Verify `process.platform`, `process.arch`, and both executable paths
before installing AI1 dependencies.

The owner defers environment setup. Keep the instructions in the
[WSL setup guide](../../wsl-setup.md). Do not treat the proposed commands as
executed. Continue macOS development work without requiring setup now.

The upstream native-keymap guide requires `libx11-dev` and `libxkbfile-dev` on
Debian-based Linux. The upstream keytar guide requires `libsecret-1-dev` on
Ubuntu. These are build requirements, not proof of a working runtime keyring.

References checked on 2026-09-30:

- <https://github.com/nvm-sh/nvm#git-install>
- <https://github.com/microsoft/node-native-keymap#installing>
- <https://github.com/atom/node-keytar#on-linux>

## Portability preparation on macOS

This work stays on `feat/wsl-support` without a commit. The checks below use the
current working tree, not a released artifact. Other editor and backlog work
can exist in the same tree. No Linux dependency tree or native file is copied
from this Mac to Windows.

Prepared changes:

- `scripts/package-linux.sh`, `scripts/linux-build-check.mjs`, and their tests:
  check the initial Linux x64/Node 24 target and build an unpacked probe directory.
  Reject root, mounted Windows tool paths, unsupported targets, and invalid
  arguments. Do not install tools, publish, or install AI1.
- `applications/electron/electron-builder-linux.yml`: extend the shared builder
  configuration. Prepare the `.deb` x64 target with the existing PNG icon.
  The shared configuration remains under the parent's ownership.
- Browser shortcut code and guest tests: select Control on Linux and Command
  on macOS. Preserve unhandled keys, AltGr, and connected-agent input.
- Agents prerequisite guidance and tests: give Linux guidance without Homebrew
  or an unverified OpenCode v1 package command. Preserve macOS messages.
- Linux updater capability handling and tests: compare source extension pins
  where available. Mark Linux tools and Git checks as unavailable with manual
  guidance. Do not run unverified tool commands or claim a failed source is current.
- Cookie import code and tests: explain the macOS-only capability in the UI.
  Reject unsupported source-list and import calls before external data access.
  Keep macOS import tests intact.
- `README.md` and `docs/wsl-setup.md`: keep the deferred setup commands and all
  unrun Linux gates explicit.

### macOS check results

| Check                                                                                  | Result                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                    | Pass across all workspaces.                                                                                                                                                                                                    |
| `npm run lint`                                                                         | Pass.                                                                                                                                                                                                                          |
| `npm run format:check` and explicit WSL document format check                          | Pass. The explicit check includes WSL documents that the default command ignores.                                                                                                                                              |
| `git diff --check`                                                                     | Pass.                                                                                                                                                                                                                          |
| `npm test`                                                                             | Pass: 703 tests across all six extension workspaces. Includes Linux platform fixtures; this is not a Linux execution result.                                                                                                   |
| `node --test scripts/linux-build-check.spec.mjs scripts/linux-builder-config.spec.mjs` | Pass: 7 tests. Includes pinned builder schema, inherited packaging rules, and script rejection paths. No Linux artifact is built.                                                                                              |
| `bash -n scripts/package-linux.sh`                                                     | Pass. Shell syntax only.                                                                                                                                                                                                       |
| `npm run build:production`                                                             | Pass on macOS. The native rebuild reports the existing Electron rebuild state. No installed app is replaced.                                                                                                                   |
| Hidden macOS browser E2E                                                               | Pass: 4 tests for find, browser keybindings, zoom keys, and cookie import confirmation. Uses isolated Theia config and Electron user data. The existing test harness uses `--no-sandbox`; these results are not sandbox proof. |
| E2E process cleanup                                                                    | The suite's plugin-host leak check passes. No broad process termination runs.                                                                                                                                                  |

The E2E command is:

```sh
npm run test:e2e --workspace e2e -- src/m3b-basics.spec.ts src/m3b-cookie-import.spec.ts --grep 'browser keybindings|zoom keys|Find in Page|profile manager confirms' --output /private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode/ai1-wsl-mac-e2e
```

This command is macOS regression evidence only. Do not use it as the first WSL
launch or sandbox probe. Linux automated tests need a reviewed launch path
without sandbox bypass.

### Blocking and unrun checks

- Linux setup remains deferred. Linux Node and native build packages are absent.
  Windows npm remains unsuitable for the Linux build.
- No clean Linux install, production build, native load, unpacked directory, or
  `.deb` artifact exists. Python 3.14 toolchain compatibility remains pending.
- The first-probe graphics, sandbox, keymap, PTY, watcher, and secure keyring
  checks remain open. Do not approve release work from macOS unit tests.
- The script rejects `--deb` until the first probe has review and maintainer
  metadata has approval. No contact details are invented.
- Linux launcher checks, runtime library requirements, Linux executable
  provenance, shell/desktop PATH, and packaged plugin resources remain pending.
  Build path checks do not prove that every wrapper uses Linux tools.
- The Linux OpenCode v2 source, keyring prerequisite, and optional desktop
  integration need owner decisions. Linux Git update checks remain unavailable.
- All actual WSL feature, networking/CDP/IPC, Stop Server, storage, performance,
  install, upgrade, rollback, uninstall, and two clean manual runs remain pending.

### Next Windows validation steps

1. When ready, follow the deferred setup guide. Keep Windows NVM unchanged.
   Confirm Linux Node 24, npm paths, native libraries, and a normal Linux user.
2. Use a fresh checkout under `/home`. Run the Linux quality checks and build
   preflight. Record sanitized output and the source commit when one exists.
3. Build the unpacked probe directory. Inventory native binaries and runtime
   library requirements. Check the pinned Electron ABI and Python toolchain.
4. Use isolated app, Theia, and tool state to run the first WSLg probe without
   sandbox bypass. Record graphics, PTY, keymap, watcher, and secure keyring results.
5. Review any failure before release packaging. Obtain approved maintainer
   metadata and the remaining support decisions. Then validate `.deb` content,
   install behavior, and the full WSL matrix twice.
