# Public repository and Omarchy plan

Status: in progress. The owner selects MIT for AI1's own code. No Omarchy test
machine is available. The owner approves the reviewed source push and public
visibility change. Personal author metadata must be removed first. App release
publication remains blocked by the runtime and security gates.

## Work sequence

1. Fix row and column pane shortcuts before release preparation.
2. Add MIT, source-build guidance, and an LLM setup prompt.
3. Review tracked files and all reachable Git history for secrets and private data.
4. Review dependency licenses and build a distribution notice manifest.
5. Verify the source build and runtime on native Omarchy x64.
6. Add a tested user installation, launcher, upgrade, and uninstall flow.
7. Select a Linux release format after install and sandbox checks.
8. Add release checksums and automated build checks.
9. Review the final file list, commit the approved changes, and obtain approval
   for the visibility change and release publication.

## Initial findings

- Origin points to `mattgle/ai1` on GitHub.
- The repository has many local changes from the editor and WSL work. Do not
  discard them or publish them without a file review.
- No tracked root license exists before this work. MIT is now added locally.
- The WSL build probe already checks Linux x64 and Node 24. It is not tied to
  Ubuntu for compilation, but no native Linux runtime check is complete.
- Gitleaks 8.30.1 runs from a verified temporary download. Local history and
  source scans pass with reviewed, exact shortcut-string exceptions.
  Ignore rules do not remove secrets from existing history.
- Omarchy requires Arch prerequisites. The first `.deb` target does not fit it.
- The setup script checks or builds only. Installation stays blocked until
  native Linux runtime and security checks pass.

## Public-release gates

- Run a standard secret scanner with redacted output on all reachable Git history
  and on the planned release working tree. Review tracked and untracked files.
- Review personal paths, hostnames, private project names, screenshots, logs,
  fixtures, endpoint addresses, and internal product details in docs and history.
- If a real credential appears, stop and rotate it. Plan any history rewrite
  separately. Do not print credentials or rewrite history without approval.
- Confirm ownership of AI1 code and third-party license obligations. MIT does
  not replace Theia or extension license notices.
- Review security defaults, app permissions, browser profile storage, and
  dependency audit findings. Do not describe the current app as hardened.
- Confirm public maintainer metadata and a vulnerability-report contact.
- Verify the public branch contains the setup scripts and required resources.

## Validation record

The isolated three-terminal test reproduces the old shortcut failure. The new
row/column behavior passes. The center-terminal shortcut and 12-pixel font tests
also pass. Shell-layout unit tests, lint, and types pass.

The setup and existing Linux prerequisite/configuration tests pass locally
(13 tests). The setup tests verify check-only mode, argument validation,
dependency preservation, build order, and failure handling with isolated stubs.
They do not compile or run AI1 on Linux. Public file review and dependency
license review remain pending. See `../../public-release-review.md` for the
secret-scan result, privacy findings, license inventory, and dependency audit.
The audit reports two critical archive-extraction findings that require review
before a ready-to-use release. Actual Omarchy compilation, Wayland, keyring, sandbox, and installation
tests remain pending. No remote changes occur in this work stage.

The next review stage adds `npm run scan:secrets` and
`npm run test:release-checks`. Final history and source scans pass. All 16
release-check tests, lint, types, and formatting pass. AI1 package license fields
match MIT. The lockfile update changes no dependency versions. The dependency
security findings and final distribution notice manifest remain open.

## Source publication: 2026-10-01

The original repo remains private as a backup. A new public `mattgle/ai1` repo
contains the reviewed source changes and the rewritten branch histories.
All 117 commit trees preserve their content. Author and committer metadata use
the GitHub handle and no-reply address. A final secret scan passes, and GitHub
metadata checks confirm the clean identities on all uploaded commits.

The public main branch includes the revised README and the experimental Omarchy
setup prompt. The local checkout tracks the clean public main branch. Old local
history remains separate and must not be pushed or merged into the public repo.
The app release, Linux runtime, dependency security, and notice gates remain open.
