# WSL setup for AI1

Status: work in progress. AI1 does not have verified WSL support or a Linux
release yet. These instructions prepare a development environment. They do not
install a supported AI1 app.

## First target

- Windows 11 with WSL2 and WSLg.
- The owner's existing `Ubuntu` distribution: Ubuntu 26.04.1 LTS on x64.
- Linux projects and a separate AI1 checkout under the Linux home directory.
- A `.deb` package after Linux build and runtime validation.

The current environment report confirms WSL2, installed WSLg, Ubuntu 26.04.1,
and `x86_64`. AI1 graphics, native modules, sandbox behavior, and packaging
remain untested on this PC.

See the [WSL specification](superpowers/specs/2026-09-30-ai1-wsl-design.md),
[compatibility plan](superpowers/plans/2026-09-30-ai1-wsl-compatibility-probe.md),
and [validation record](superpowers/plans/2026-09-30-ai1-wsl-validation.md).

## Check the Windows environment

Run these read-only commands in Windows PowerShell. They report the WSL,
distribution, and Windows versions:

```powershell
wsl --version
wsl --status
wsl --list --verbose
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
```

The selected distribution must use WSL version 2. The confirmed distribution
name on the first test PC is `Ubuntu`. This command opens it:

```powershell
wsl -d Ubuntu
```

Do not change or restart other distributions. `wsl --shutdown` stops all active
WSL distributions and their processes. It is not a routine setup step.

## Check the Linux environment

Run these read-only commands inside Ubuntu. They report the distribution, CPU,
user, display settings, and available tools:

```sh
cat /etc/os-release
uname -m
id -u
printf 'DISPLAY=%s\nWAYLAND_DISPLAY=%s\n' "$DISPLAY" "$WAYLAND_DISPLAY"
node --version
npm --version
git --version
python3 --version
cc --version
tmux -V
command -v lsof
command -v ps
```

Use a normal Linux user, not root. WSLg display variables are required, but
their presence does not prove that AI1 renders correctly.

These read-only commands locate the Node tools and check native build packages:

```sh
type -a npm node nodejs nvm
readlink -f "$(command -v npm)"
dpkg-query -W build-essential pkg-config libsecret-1-dev libx11-dev libxkbfile-dev
```

Missing commands or packages are setup findings. On the first test PC, `npm`
comes from Windows NVM under `/mnt/c`, while Linux Node and the build packages
are absent. Do not use Windows npm to install Linux AI1 dependencies.

## Install Linux build tools when ready

These steps change the Ubuntu environment. Run them only when ready to prepare
the development build. They are not needed to use the current macOS app.
Stop if a command fails. Do not continue with an incomplete installation.

The first command updates Ubuntu's package list. The second installs the C/C++
build tools, package metadata tool, native development libraries, and download
tools. Review the package manager's proposed changes before confirmation:

```sh
sudo apt update
sudo apt install build-essential pkg-config libsecret-1-dev libx11-dev libxkbfile-dev ca-certificates curl
```

`libx11-dev` and `libxkbfile-dev` support native-keymap builds. `libsecret-1-dev`
supports keytar builds. A successful build does not prove that a secure keyring
service is available. Runtime library and keyring validation remain separate gates.

## Install Linux Node 24 when ready

Use Linux NVM separately from Windows NVM. Do not remove or change Windows NVM.
Do not copy Windows global packages or `node_modules` into Linux.

These commands create a Linux NVM installation under `$HOME/.nvm`, load it into
the current shell, and install Node 24. They do not edit shell startup files.
The clone command must not overwrite an existing `$HOME/.nvm` directory. If
that directory already exists, stop and check its contents before proceeding:

```sh
git clone --depth 1 --branch v0.40.8 https://github.com/nvm-sh/nvm.git "$HOME/.nvm"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 24
```

These read-only commands verify the selected tools:

```sh
node --version
npm --version
command -v node
command -v npm
node -p "process.platform + ' ' + process.arch"
cc --version
```

Expect Node 24, `linux x64`, and Node/npm paths under the Linux home directory.
Do not continue if npm still resolves to a Windows installation.

In a new Ubuntu shell, these commands load the existing Linux NVM installation
and select Node 24. No shell startup change is required for this manual flow:

```sh
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 24
```

## Linux build probe: not yet run

The Linux build and launch procedure is not verified yet. Do not use
`scripts/package-mac.sh` on Linux. It requires macOS tools and targets macOS arm64.

Do not run these commands now if setup is deferred. When ready, use a separate
checkout under `/home/<user>/code`. Keep the pinned dependencies and lockfile.
Do not copy a Windows or macOS dependency tree.

The first command installs the locked dependencies in that Linux checkout.
The next commands check code quality. The last command checks Linux build tools
without building, installing tools, or changing the system:

```sh
npm ci
npm run lint
npm run typecheck
npm test
node --test scripts/linux-build-check.spec.mjs
bash scripts/package-linux.sh --check
```

Check Node and npm paths before `npm ci`. The build check requires Linux x64,
Node 24, a normal user, Linux tool paths, and the native development libraries.
It rejects the first PC's mounted Windows npm path. It does not prove that Python
3.14 can build the pinned native modules or that a keyring exists.

After these checks pass, this command downloads the pinned plugins, builds the
production app, rebuilds native modules for Electron, and creates an unpacked
Linux directory for the first compatibility probe:

```sh
bash scripts/package-linux.sh --dir
```

The output is `applications/electron/dist/linux-unpacked`. The command uses the
existing PNG icon. It does not use Swift, `sips`, `iconutil`, macOS signing, or
`/Applications`. It does not install or publish AI1.

Use that directory only for the isolated runtime checks in the compatibility
plan. Prove native loading, WSLg graphics, a PTY, sandbox behavior, and secure
keyring behavior before release packaging. Do not launch against real app data.
No verified launch command or runtime library list exists yet.

The separate `applications/electron/electron-builder-linux.yml` extends the
shared builder configuration. It prepares an x64 `.deb` target. The script
rejects `--deb` and `--install` while the first-probe gates remain open.
The app also lacks approved package maintainer contact metadata. Do not invent
a name or email address. Installed-app, checksum, dependency/license manifest,
upgrade, rollback, uninstall, and optional desktop integration checks remain
pending. An unpacked directory is not a verified `.deb` release.

Before an AI1 installation guide is complete, verify:

- A clean Linux checkout and dependency installation under the Linux home directory.
- Python 3.14 compatibility with the pinned native build tools.
- The pinned Electron ABI, native modules, and required runtime libraries.
- A normal-user WSLg launch without sandbox bypass or global debugging.
- Terminal PTY, keyboard input, clipboard, file watching, and browser rendering.
- Secure profile persistence and explicit behavior when a keyring is absent.
- The `.deb` package, install, upgrade, rollback, and uninstall behavior.

Do not disable the sandbox, install Windows tools as fallbacks, or change WSLg
display variables to make a test pass. Do not put projects or shared dependencies
under `/mnt/c` for the initial build probe.

## Linux feature limits in the source changes

- Browser guests select Control shortcuts on Linux and Command on macOS.
  Actual WSLg keyboard layout, AltGr, clipboard, and terminal checks remain pending.
- External cookie import remains macOS-only. Linux callers receive an explanation.
  Log in inside an AI1 browser profile instead. Secure persistence still needs a probe.
- Linux tool updates require manual action through an approved source. AI1 does
  not run Homebrew or install tools. The Linux OpenCode v2 source remains an owner
  decision. Do not install an unverified package that provides OpenCode v1.
- Linux source checkouts can compare bundled extension pins with Open VSX.
  Linux Git update checks remain unavailable until tool discovery is verified.
  A failed or missing comparison does not mean the app is up to date.

## References

Checked on 2026-09-30. Upstream instructions do not prove AI1 compatibility:

- [Microsoft: Linux GUI apps with WSL](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps)
- [Microsoft: WSL file storage](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
- [NVM: Git installation](https://github.com/nvm-sh/nvm#git-install)
- [native-keymap: build libraries](https://github.com/microsoft/node-native-keymap#installing)
- [keytar: Linux build library](https://github.com/atom/node-keytar#on-linux)
