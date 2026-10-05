# Release readiness work

Status: in progress. WSL work is deferred. The active target is native Omarchy
x64. No Omarchy test machine is available. Use isolated editor fixtures until
the owner supplies a project and affected file.

## Order

1. Reproduce unsafe archive extraction at Theia's actual deployment call site.
2. Update compatible dependencies without automatic framework downgrades.
3. Verify archive rejection, native builds, language resources, and packaging.
4. Prepare Linux user installation, launcher, upgrade, rollback, and removal.
5. Add tests for those flows without claiming native Linux runtime verification.
6. Generate dependency notices from the build inputs and verify packaged notices.
7. Extend nested-project fixtures for React and React Native imports.
8. Verify native Omarchy runtime and the owner's actual editor project when available.

## Approved decisions

- Use GitHub private vulnerability reporting. The feature is enabled.
- Keep Theia pins aligned. Do not use `npm audit fix --force`.
- Do not replace the installed app, publish a binary, or claim Omarchy support
  before the remaining runtime and release checks pass.
- Keep new source changes local until the owner approves publication.
  The 2026-10-05 approval permits a source commit and push on
  `feat/release-readiness`. It does not permit a merge or binary publication.
- Keep WSL tests and distribution work for a later task.
- Prepare an Arch package managed by pacman. Native installation waits for
  Omarchy runtime and release checks. Keep a saved package for rollback.
- Use `mattgle` and GitHub private vulnerability reporting as public maintainer
  details. Do not publish a personal email or real name.

Terminal attention and rounded panels take priority in this work stage.
Arch package preparation and final license notices remain open.

## Verified local results

The legacy extractor fails both escaping-link tests before replacement. The
maintained extractor passes both tests and valid extraction through Theia's
actual call site. The packaged dependency copy passes the same three tests.

The builder update removes its vulnerable tar 6 copies. Electron pins align at
42.11.8. The audit has zero high and critical findings. Six low and 42 moderate
findings remain. The production build and local macOS package pass.

Eight Electron startup tests and six language-resource tests pass. The import
tests use small declaration fixtures, not full React or React Native packages.
They keep real type errors and report a missing module when the fixture is
removed. No VS Code comparison is complete.

All 17 release checks, lint, types, and formatting pass. New source changes stay
local. The installed app stays unchanged. Native Omarchy tests, installation,
distribution notices, and maintainer metadata remain open.

## Update: 2026-10-02

Agents sessions now start in persistent shell tabs. OpenCode exit leaves the
shell usable. Selecting an existing session only focuses that shell. Session
cleanup does not dispose a persistent shell. A helper clears the status link
after process exit. Working status uses a thin blue border and a light tint.
Section badges stay within their icon tabs.

The local macOS bundle includes the changes. All 732 workspace unit tests and
three archive checks pass. All 34 combined packaged UI tests pass. The checks include Control+C and hook
setup. The installed app remains unchanged. No source or binary is published.

Arch package files, checksum preparation, isolated staging tests, and a native
install/upgrade/rollback/removal test plan are ready. Native execution remains
blocked by the lack of an Omarchy machine.

The package contains an actual-file notice inventory with 544 notice files and
83 unresolved entries. Distribution-license review remains open. Maintainer
metadata uses `mattgle`. The audit still has six low and 42 moderate findings.
The runtime-path review remains open for applicable security fixes.

Claude Code 2.1.282 and Codex 0.159.0 are installed. Version and official hook
reference checks are complete. Packaged helper tests do not replace full CLI
hook lifecycle checks. No global agent settings change. Gemini stays a follow-up.
