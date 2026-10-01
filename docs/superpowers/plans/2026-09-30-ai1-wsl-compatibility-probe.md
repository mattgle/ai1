# AI1 WSL compatibility probe

Date: 2026-09-30
Branch: `feat/wsl-support`
Status: Windows and Linux environment recorded. Linux setup is deferred. Source groundwork is prepared on macOS. No Linux build or AI1 WSL launch result exists yet.
Specification: [WSL design](../specs/2026-09-30-ai1-wsl-design.md).
Evidence: [WSL validation record](2026-09-30-ai1-wsl-validation.md).

## Target

Use the owner's existing Ubuntu 26.04.1 x64 distribution inside WSL2 with WSLg.
The first package format is `.deb`. Do not require another distribution.
Use the owner's Windows machine for WSL checks. Use macOS for regression checks.
Keep the pinned Theia, Electron, and electron-builder versions.

## Step 1: record the Windows and Linux environment

Run these read-only commands in Windows PowerShell:

```powershell
wsl --version
wsl --status
wsl --list --verbose
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
```

Use the returned distribution name for subsequent commands. Do not assume that
the installed name has a release suffix. The confirmed name on this PC is `Ubuntu`.
Confirm the distribution uses WSL version 2.
Confirm the Windows host has current WSLg and GPU support from the official
requirements in the specification. Do not change the default distribution.

In the selected Linux distribution, collect:

```sh
cat /etc/os-release
uname -m
uname -r
id -u
printf 'DISPLAY=%s\nWAYLAND_DISPLAY=%s\nXDG_RUNTIME_DIR=%s\n' "$DISPLAY" "$WAYLAND_DISPLAY" "$XDG_RUNTIME_DIR"
node --version
npm --version
git --version
python3 --version
cc --version
c++ --version
tmux -V
command -v lsof
command -v ps
```

Missing commands are probe findings. Do not install them automatically. Do not
print all environment variables, service configuration, or credential files.
Check a simple existing GUI app before an AI1 launch. Do not use sandbox bypass
or overwrite WSLg display variables to obtain a passing result.

## Step 2: prepare a clean Linux source build

- Use a separate checkout under the Linux home directory.
- Do not share `node_modules` with Windows or macOS.
- Verify Ubuntu 26.04 build and runtime library names against the pinned native
  dependencies before giving installation commands.
- Obtain explicit approval for any system package installation.
- Use Node 24, `npm ci`, and the pinned plugin download command.
- Run lint, types, and unit tests before the production build.
- Run `npm run build:production`. This includes Theia's Electron native rebuild.
- Inventory native modules and bundled executables. Check Linux architecture,
  shared-library dependencies, and Electron ABI compatibility.

Keep logs free of credentials. Record the source commit and tool versions.
Do not upgrade dependencies to hide a failed compatibility check.

## Step 3: prove runtime behavior

Use a disposable workspace and separate app, Theia, and OpenCode state.

1. Launch as a normal Linux user with the pinned Electron runtime.
2. Confirm a usable WSLg window, without `--no-sandbox` or global debugging.
3. Check a terminal PTY, input, resize, and interrupt.
4. Check the native keymap and file watcher.
5. Check browser rendering, sandboxed guest preferences, and clipboard.
6. Check secure profile persistence with and without the available keyring.
7. Record failures and the default graphics path. Do not infer a WSL result
   from a macOS pass or a Linux container pass.

The production package is a later check. A source launch does not prove that
the `.deb` contains all native modules, plugins, resources, or runtime dependencies.

## Step 4: select the first implementation slice

After the runtime probe identifies a viable secure path:

- Add Linux `.deb` configuration and a separate Linux build command.
- Use the existing PNG app asset. Do not run Swift, `sips`, or `iconutil` on Linux.
- Add platform-aware browser shortcuts with macOS and Linux unit tests.
- Add Linux tool guidance and explicit unsupported cookie-import behavior.
- Preserve the browser IPC, profile, CDP, and process-control safety rules.

Keep each change bounded and testable. Obtain a separate decision for a required
runtime upgrade, new credential-storage requirement, or security constraint.

The owner permits bounded source preparation on macOS before this gate passes.
This work does not approve a secure runtime path or complete a later slice.
The Linux probe script supports `--check` and `--dir` only. It blocks `.deb`
release packaging until the runtime gate has review and maintainer metadata is
approved. See [the deferred setup guide](../../wsl-setup.md).

## Gates and feedback

- Run lint, types, formatting, unit tests, and relevant Electron checks on macOS.
- Keep macOS icons, Command keys, Homebrew updates, and cookie import intact.
- Let the owner test the macOS package after each app change.
- Run clean Linux build and package checks on the selected WSL target.
- Record actual WSLg results in a separate validation report.
- Do not publish a package or push this branch without approval.

## Current evidence

| Check                              | Result                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target decisions                   | Owner selects the existing Ubuntu 26.04.1 x64 PC, WSL2/WSLg, and `.deb`. This replaces the earlier 24.04 choice.                                                                                                                                     |
| Windows test host                  | Owner reports Windows 11 Home, WSL `2.7.14.0`, WSLg `1.0.73.2`, and a running WSL2 distribution named `Ubuntu`.                                                                                                                                      |
| Linux environment                  | Ubuntu 26.04.1, `x86_64`, UID `1001`, `DISPLAY=:0`, and `WAYLAND_DISPLAY=wayland-0`. Linux Node and compiler are missing. npm resolves through Windows NVM at `/mnt/c/nvm4w/nodejs/npm`; do not use it. The listed native build packages are absent. |
| Linux dependency install and build | Not run.                                                                                                                                                                                                                                             |
| Native modules and PTY             | Not run on Linux.                                                                                                                                                                                                                                    |
| WSLg graphics and sandbox          | Not run.                                                                                                                                                                                                                                             |
| Linux package                      | Not built.                                                                                                                                                                                                                                           |
| macOS regression                   | Existing app passes owner testing before WSL changes. New source checks are recorded in the validation record. They do not prove WSL compatibility.                                                                                                  |
