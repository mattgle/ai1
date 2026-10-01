# Public-release review

Initial review: 2026-09-30. Public source publication: 2026-10-01.
Status: source is public; app release checks remain in progress. This review is
not a security certification. App distribution still requires the runtime,
security, and notice checks below.

## Secret scan

Gitleaks 8.30.1 scans all locally reachable Git refs with `--log-opts=--all`.
A second scan covers a copy of tracked and untracked non-ignored source files.
Both scans use full redaction. Build output and installed dependencies are not
part of the source snapshot. This does not check inaccessible remote refs,
GitHub issue content, or secrets stored outside the checkout.

The default rules flag four historical shortcut assignments and two current
shortcut assignments. Review confirms that the values are Theia shortcuts, not
credentials. `.gitleaks.toml` permits only the exact matching assignments for
`ctrlcmd+shift+1`, `ctrlcmd+shift+2`, and `ctrlcmd+shift+g`. All other default
rules remain enabled. History and source scans then pass.

The repeatable command requires Gitleaks. It does not download or install it:

```sh
npm run scan:secrets
```

Use `GITLEAKS_BIN` when the verified executable is outside PATH. Reports stay
in a temporary folder and hide secret values. Do not commit reports or the
source snapshot. A passing scan does not prove that no secrets exist.

Repeat the scan immediately before publication. Review the actual staged file
list as well. Ignore rules do not remove secrets from Git history.

## Privacy review

The current WSL environment record contains a real Windows user folder name.
That name is replaced with `<user>`. No history rewrite occurs.

The tmux tests use generic `/Users/me` fixtures. Other matches include privacy
check commands, test addresses, and dependency author metadata. Those are not
credentials. A check of reachable text blobs finds no known personal home path
from the local development machine or the WSL record.

Manual review of screenshots, other assets, author metadata, private project
references, and remaining document content is still required. Do not treat the
targeted text checks as a complete privacy review.

The owner requests removal of personal author metadata before source publication.
The publication copy uses the GitHub handle and GitHub no-reply address for
author and committer metadata. The rewrite runs in an isolated mirror. All 117
commit trees keep the same content. The final secret scans pass, and a check of
871 reachable file objects finds no known personal data. GitHub author and
committer metadata checks pass on all uploaded commits. Third-party copyright
notices remain unchanged.

The original repo remains private as a backup. A separate repo receives only
the clean history and becomes public. This avoids publication of the old commit
objects through the original repo's cache. The public repo does not resolve the
old private main commit. Existing users should use a fresh clone of the public
repo rather than merging old private history into it.

## Dependency security

The baseline `npm audit` reports 65 findings: 4 low, 44 moderate, 15 high,
and 2 critical. These are package-level findings, not 65 proven app exploits.
No dependency version changes occur during this review.

| Finding | Current path | Required follow-up |
| --- | --- | --- |
| Critical `decompress` archive extraction | Theia CLI and extension deployment | Check a compatible upstream fix. Test malicious archive rejection before distribution. |
| Critical `tar` archive extraction | electron-builder's rebuild and archive dependencies | Review a compatible builder update and run package regression tests. |
| High Electron findings | Multiple Electron dependency paths | Match each advisory to the actual packaged Electron version and guest configuration. |
| Other high findings | Runtime and build dependencies | Separate reachable runtime paths from build-only paths. Review compatible fixes. |

Theia's plugin deployer calls `decompress` to extract extension archives.
Do not dismiss that finding as build-only. Do not use an automatic audit fix:
the proposed resolutions include older Theia versions and major test-tool
changes. Keep framework pins together and test explicit updates.

The critical findings block a ready-to-use app release until a fix or a reviewed
mitigation is in place. A public source repository can state known limitations,
but it must not advertise a secure or supported Linux installation yet.

## Licenses and distribution notices

AI1's own package manifests now declare MIT, matching the root license.
Third-party source notices remain intact, including the browser screenshot
code's MIT notice. AI1's license does not replace dependency licenses.

CycloneDX npm 6.0.1 generates a locked dependency inventory for review. The
baseline inventory contains 1,012 components and includes development tools.
It is not the final list of files shipped in an app. The baseline has 24 entries
without license metadata; five are AI1 packages before the metadata correction.
Missing metadata requires checking the package files, not guessing a license.

All 17 currently bundled extensions include a license file. The Media Preview
extension's referenced file contains MIT. The other extension notice contents
and bundled third-party assets still require review.

The inventory includes EPL, LGPL, attribution, and font-license entries as well
as permissive licenses. Before binary distribution, map these entries to the
actual app files and include their required license texts and notices. Verify
Electron, native modules, fonts, icons, and bundled extension assets separately.
A dependency inventory alone is not a complete distribution notice manifest.

## Open release gates

The final local history and source scans pass. All 16 release-check script tests,
lint, type checks, formatting, and whitespace checks pass. The lockfile license
metadata update changes no dependency version, source URL, or integrity hash.
These checks do not validate Linux runtime behavior or clear the audit findings.

- Continue privacy and ownership checks before each future release.
- Review the security findings and compatible fixes.
- Build a complete distribution notice manifest from the actual app contents.
- Confirm public maintainer metadata and a private security-report channel.
- Test native Omarchy runtime, sandbox, Wayland, terminal input, and keyring.
- Test installation, launcher, upgrade, rollback, and removal.
- App release publication needs separate approval and remains blocked by the
  open checks above. Public source publication is complete.
