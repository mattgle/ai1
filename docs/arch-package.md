# Experimental Arch package

Status: package files and isolated staging tests are ready. Native Omarchy
build, runtime, and pacman tests remain open. No package is published or installed.

## Package inputs

The package uses bundled Electron. Arch guidance places this form in `/opt`.
AI1 installs to `/opt/ai1`. `/usr/bin/ai1` passes arguments to that binary.
The desktop entry uses the same launcher. Neither adds `--no-sandbox`.
The package uses the public maintainer name `mattgle`.

First build `applications/electron/dist/linux-unpacked` on Linux x64.
See [Omarchy setup](omarchy-setup.md). Review the generated notice manifest.
Unresolved notice entries block package preparation. A clear inventory does
not replace review of fonts, icons, native libraries, or source-offer duties.

This command copies the unpacked app into a new package-input folder. It writes
an archive, checksum values, and a PKGBUILD. It does not run pacman or install files:

```sh
node scripts/prepare-arch-package.mjs applications/electron/dist/linux-unpacked applications/electron/dist/arch-inputs
```

Review `packaging/arch/PKGBUILD.in`, the generated PKGBUILD, and runtime
dependencies. Validate the desktop entry with `desktop-file-validate`.
Build as a normal user with `makepkg` from the generated folder. Do not use
`makepkg --install` before the runtime and license checks pass. Use `namcap`
to inspect the generated package on Arch. The preparation script rejects
non-Linux x64 executables and an existing output folder.

The output folder must be outside the app input, including through a symbolic
link. Preparation rejects external, absolute, and broken payload links. It
rejects set-user-ID, set-group-ID, sticky, group-write, and other-write modes.
The app binary must have executable permission. Notice source files and copied
text must match the manifest SHA-256 values. These checks do not certify license
compliance or native app behavior.

Source notice paths use the unpacked app root, as the Linux `afterPack` hook
requires. Copied notice text paths use `resources/app/resources/notices`.
Both path checks reject files outside their root, including through links.

The package keeps the Electron sandbox enabled. It does not make
`chrome-sandbox` set-user-ID. The native check must confirm that the normal-user
sandbox works on the target kernel. Stop if it fails. Do not change file modes
or add `--no-sandbox` to bypass the failure.

## Native lifecycle checks

Use an isolated Omarchy test machine. Get approval before each privileged
operation. Keep the existing package and user-data backup before an upgrade.

1. Inspect package files with `pacman -Qlp <package>`.
2. Install with `sudo pacman -U <package>` after approval.
3. Check ownership with `pacman -Qo /usr/bin/ai1 /opt/ai1/ai1`.
4. Launch from the desktop entry and `ai1 <workspace>`. Use a workspace path
   that contains spaces. Keep the sandbox enabled. Verify Wayland and keyring.
5. Create persistent shells and save a split layout. Quit the app normally.
6. Save the current `.pkg.tar.zst` file outside the temporary build folder.
   Back up user data while AI1 is closed. Install the next package with
   `sudo pacman -U <new-package>` after approval. Verify the saved layout.
7. Close AI1. Use `sudo pacman -U <saved-package>` for rollback after approval.
   Restore the backup if the newer app changes an incompatible data format.
8. Close AI1. Remove the app with `sudo pacman -R ai1` after approval.
   Verify that pacman removes the launcher, desktop entry, icon, and app files.
   Check that user configuration, projects, and tmux sessions remain unchanged.

The package has no install script. It does not edit a shell profile, Hyprland
settings, agent settings, or user data. Package removal does not kill tmux
sessions. Remove user data only through a separate approved action.

These steps are a test plan, not evidence that native installation works.

## Isolated staging evidence, 2026-10-07

The focused tests run on macOS with fake Linux ELF headers. They do not run
Electron, makepkg, namcap, or pacman. The tests cover:

- Package file paths, launcher and desktop modes, icon and license placement.
- Separate `0.1.0` and `0.1.1` package roots with the same installed file paths.
  The old input archive stays unchanged. This is not an upgrade or rollback test.
- No package install hook, service action, user-data path, or tmux stop command.
  A user-data marker stays unchanged. This is not a pacman removal test.
- Launcher argument order, spaces, empty arguments, literal wildcards, and the
  app exit code. The test replaces only the system app path with a fake app.
- No sandbox-disable, plaintext-password-store, or debug-port launcher flag.
- Rejection of unsafe payload modes, external links, nested output, existing
  output, version mismatch, invalid manifests, and changed notice bytes.
- Real notice-generator integration with root runtime notices and nested package
  notices. Changed source or copied text, escaping paths, and unresolved entries
  stop preparation before it creates an output folder.

Run the focused tests from the checkout. They create and remove only their own
temporary fixture folders:

```sh
node --test scripts/prepare-arch-package.spec.mjs scripts/setup-linux.spec.mjs scripts/linux-build-check.spec.mjs
```

All 26 focused tests pass on 2026-10-07. Scoped ESLint, Prettier, shell syntax,
and diff whitespace checks pass. Relative payload links stay relative after
archive extraction. No real app artifact changes in this check.

## Required native evidence

The owner must supply an isolated native Omarchy x64 machine with a Wayland
session, a normal user, and a working secure keyring. Supply approved repository
access, a fresh checkout path, and permission for each install or removal action.
Do not send credentials in chat. Real package preparation also needs a reviewed
Linux x64 app with no unresolved notices. Upgrade and rollback need two reviewed
package versions, the old package archive, and a closed-app user-data backup.

Record the Omarchy, kernel, Node, npm, Electron, and package versions. Record
these pending results separately:

| Native check | Required result |
| --- | --- |
| Source build | Prerequisite check, locked install, lint, types, tests, and Linux x64 unpacked build pass. |
| Package review | `desktop-file-validate`, `makepkg`, and `namcap` results are reviewed. Package contents stay under the intended system paths. |
| Install and ownership | Approved `pacman -U` succeeds. Pacman owns the launcher, desktop entry, icon, license, and app files. |
| Launch | The desktop entry and `ai1 <workspace>` open the correct workspace, including a path with spaces. |
| Sandbox | A normal-user launch works without disabled security controls. Native process evidence confirms the Electron renderer sandbox. |
| Keyring | The actual session keyring stores and reads a disposable test secret across restart. No plaintext fallback is used. Do not record the secret. |
| Runtime | Wayland display, scaling, shortcuts, clipboard, file watching, native modules, browser profile storage, image preview, and language services work. |
| Upgrade | The approved new package opens saved persistent terminals and split layout. Projects and user settings stay unchanged. |
| Rollback | The approved old package launches with compatible user data or the approved restored backup. |
| Removal | Pacman removes all package-owned files. Projects, user settings, and tmux sessions remain. |

All native results in this table remain unavailable. Staging evidence does not
close these release gates.

The 2026-10-06 local review confirms that the shared Linux configuration keeps
the clean FFmpeg and complete runtime-notice hooks. The isolated Arch staging
checks pass. The source setup guard rejects macOS before an install or build.
No Omarchy machine is available. The latest notice inventory still has five
unresolved package entries, so real package preparation remains blocked.
See [release evidence](public-release-review.md) for the separate source and
native-library limits.

## References

- [Arch Electron package guidance](https://wiki.archlinux.org/title/Electron_package_guidelines)
- [Arch package guidance](https://wiki.archlinux.org/title/Arch_package_guidelines)
- [Pacman](https://wiki.archlinux.org/title/Pacman)
