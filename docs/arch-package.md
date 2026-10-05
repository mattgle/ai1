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

## References

- [Arch Electron package guidance](https://wiki.archlinux.org/title/Electron_package_guidelines)
- [Arch package guidance](https://wiki.archlinux.org/title/Arch_package_guidelines)
- [Pacman](https://wiki.archlinux.org/title/Pacman)
