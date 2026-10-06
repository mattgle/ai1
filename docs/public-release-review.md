# Public-release review

Initial review: 2026-09-30. Public source publication: 2026-10-01.
Status: source is public; app release checks remain in progress. This review is
not a security certification. App distribution still requires the runtime,
security, and notice checks below.

## Source push approval: 2026-10-05

The owner approves a source commit and push on `feat/release-readiness`.
This approval does not include a merge to `main`, app installation, or binary
publication. Security, license, source-duty, live-hook, startup reliability,
and native Omarchy gates remain open. Earlier local-only records describe
the state before this approval.

## Startup failure evidence: 2026-10-05

The Changes settings test now records launch phases, process IDs, process
exit events, application close events, window events, elapsed times, and
stdout/stderr byte counts. It does not record output text, command arguments,
environment values, workspace paths, or server credentials. Each launch
failure writes `changes-settings-launches.json` before cleanup. The test also
attaches its records before final cleanup. This preserves failure evidence
when cleanup does not complete.

Ten separate packaged settings tests pass with the same launch sequence and
timeout values. Their records contain 40 ready launches and 30 process exits
before final cleanup. The first three launches in each test record both
process exit and application close before the next launch. All ten records
pass the local path and credential-field check. No failure appears in this
measurement, so it does not identify a cause or establish a fix. The earlier
second-launch timeout and cleanup timeout remain open release risks.

## Pinned notice assets: 2026-10-05

Source commit `dec015f` is on `feat/release-readiness` in the public repository.
The branch does not merge to `main`. No binary publication or app installation
occurs.

The production build prepares 13 pinned public notice assets. Each download
uses an immutable source commit and an expected SHA-256 hash. Preparation
preserves the complete upstream bytes, including TypeScript's CRLF endings.
Existing verified assets permit offline builds. A changed existing file,
escaping path, external parent link, dangling link, or hash mismatch stops
preparation. Atomic file creation does not replace an existing destination.
The tests use fixtures and do not need network access.

The evidence maps exact package names, versions, and license metadata for
TypeScript 5.6.3, Slash 1.0.0, Markdown Anchor 9.2.1, Type Fest 2.19.0,
Ignore 3.3.10, Agent Base 6.0.2, HTTP Proxy Agent 4.0.1 and 5.0.0,
HTTPS Proxy Agent 5.0.1, SOCKS Proxy Agent 5.0.1, and Cookie Signature 1.0.7.
The proxy and cookie notice assets preserve complete upstream README files
with their copyright and MIT terms. Type Fest includes both offered license
texts. TypeScript includes its license and separate third-party notice.
The AI1 archive adapter now includes the unchanged project MIT license.

The local macOS bundle has 563 notice files and 11 unresolved entries, down
from 24. All 13 prepared asset hashes and all 20 generated output hashes match
the packaged bytes. All 38 release checks, six language checks, and 11 combined
packaged evidence, sanitizer, and Changes settings tests pass. Lint and types
pass. A passing settings test does not resolve the earlier startup timeout.

The remaining inventory entries are the native MessagePack extraction module,
Once 1.1.2, East Asian Width 0.2.0, Fast URI's benchmark package, Font Awesome
4.7.0, IMurmurHash 0.1.4, Resolve Package Path 4.0.3, Use Composed Ref 1.4.0,
and the CSS, HTML, and JSON extension servers. Once, East Asian Width,
Resolve Package Path, and Use Composed Ref do not have verified complete
license text at the checked release commits. Do not use a newer release's
license text or a different package's parent license to clear these entries.
Native libraries, fonts, copied code, extension inputs, and source duties
remain separate release checks. Notice counts do not establish compliance.

### Additional notice and build-input review: 2026-10-05

The local bundle now has 565 notice files and nine unresolved entries.
Production builds prepare 15 pinned notice assets. The two new supplements
cover IMurmurHash 0.1.4 and the native MessagePack extraction package for
Darwin arm64 3.0.4. The IMurmurHash tag resolves to commit
`9f40361c7e2835a9b7b8eaa1cbab2a9f94ee22a2`. Both packaged JavaScript files
match that commit byte-for-byte. Its complete README includes the MIT terms
and copyright notice. The MessagePack registry identifies commit
`71def7bd969e5c88d2c918e0d81ee2ba3155d19c`. The source manifest lists the
exact platform package as an optional dependency at 3.0.4. The published
platform archive passes its npm SHA-512 integrity check. The supplement
preserves that source commit's MIT license. This does not verify the native
binary's complete source or copied-code duties.

Font Awesome 4.7.0 remains unresolved. Its pinned README and website source
link to OFL and MIT terms but do not contain their complete text. The TTF
metadata retains Dave Gandy's 2016 copyright and a license URL, not the full
terms. The three extension-server manifests match VS Code 1.95.3 at commit
`f1a4fb101478ce6ec82fe9627c43efbf9e98c813`. Their packaged extension license
bytes differ from that commit's root license. Version agreement alone does
not establish the extension build's source connection. Keep those entries
unresolved. Once, East Asian Width, Fast URI's benchmark, Resolve Package
Path, and Use Composed Ref also remain unresolved.

The read-only Theia source review now accepts a build-input report. It checks
positive input contributions against lockfile-verified published archives and
payload files. It rejects missing input metadata, duplicate records, invalid
byte contributions, and escaping package paths. Its output keeps changed,
absent, and unreviewed inputs visible. The command returns a failure status
when any contributing input remains unresolved.

The actual comparison finds 1,890 equal contributing files across 40 Theia
packages and two changed package manifests. The package-wide comparison still
finds 4,359 equal `src/lib` files across 41 packages and 2,113 absent files.
The additional equal inputs include shared wrappers, themes, and translations.
The changed files are `@theia/core/package.json` and
`@theia/plugin-ext/package.json`. Compared with the installed original
manifests, packaging removes only `keywords`, `bugs`, `scripts`, `nyc`, and
`gitHead`. No retained field changes. The command correctly keeps a failure
status for these byte differences. This report does not verify transformed
build inputs, Monaco, added source files, extension bundles, or complete
corresponding-source duties.

The matching build-tree comparison checks 47 installed Theia 1.75.0 packages.
All 1,892 contributing inputs across 40 packages match published archive bytes
in the current build tree. This separates the two payload manifest changes
from current source-tree changes. It does not establish a source snapshot at
build time or replace the transformed-input review.

Repeat the contributing-input check with:

```sh
node scripts/review-theia-source.mjs <app-payload> package-lock.json <build-input-report>
```

Use `.` instead of `<app-payload>` to check the current build tree. A failure
status with two changed package manifests is the current payload result.
Do not report it as a clean source-coverage result.

The exact lockfile archives for Once 1.1.2, East Asian Width 0.2.0,
Resolve Package Path 4.0.3, Use Composed Ref 1.4.0, and Font Awesome 4.7.0
also pass SHA-512 verification. Their notice files do not supply the missing
complete terms. Once's archive contains only its compiled code, type file,
source map, and package manifest. The other archives have README files,
but those files do not contain the required complete license terms. This
confirms an upstream evidence gap rather than a notice lost only in packaging.

All 11 packaged evidence, sanitizer, and Changes settings tests pass on the
new bundle. The build's six language checks pass. The two added proxy-caller
tests pass in development and against packaged dependencies. The cache test
still reproduces the known 4.2.0 defect under its pending marker.
Unit tests, 41 release checks, three archive checks, lint, types, formatting,
whitespace checks, and both redacted secret scans pass. The lockfile hash
stays unchanged. The extended source review remains a failure result for the
two manifest byte differences; these passing checks do not clear that result.

## Extension-server source connection: 2026-10-05

Further publisher-history review identifies commit
`938dde2ae58ceea639df05238892e05df59f255c` in
`eclipse-theia/vscode-builtin-extensions`. Its VS Code submodule points to
`f1a4fb101478ce6ec82fe9627c43efbf9e98c813`, the exact 1.95.3 source commit.
The publisher's `src/version.js` uses that source tree's version for the
extension version. Its `src/package-vsix.js` copies the source root
`LICENSE.txt` into each extension as `LICENSE-vscode.txt`.

The packaged CSS, HTML, and JSON extension notices differ from the pinned
root text only in CRLF line endings. All three retain SHA-256
`cce33203a80863c22499035b1cfb6aba5df5f02e4ea2669cf5bc5730c1864236`.
The new supplement preserves the original LF source text separately with
SHA-256 `9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9`.
No existing notice bytes change. Exact source manifests identify
`vscode-css-languageserver` 1.0.0, `vscode-html-languageserver` 1.0.0, and
`vscode-json-languageserver` 1.3.4 with MIT metadata. The supplement maps only
those reviewed name/version pairs. A packaged regression checks both notice
forms and the parent extension versions. This closes the source-connection
gap described above for these notice mappings. It does not verify every
third-party input in the extension bundles or complete their source duties.

The rebuilt local app has 566 notice files, six unresolved entries, and 16
prepared notice assets. The remaining entries are Once, East Asian Width,
Fast URI's benchmark, Font Awesome, Resolve Package Path, and Use Composed Ref.
The packaged tests verify the source license hash, all three existing CRLF
notice hashes, and every recorded generated output hash. Six build language
checks pass. The read-only audit still reports four low, 38 moderate, and
12 high findings. Braces remains at 3.0.3 without a published fixed version.
HTTP Cache Semantics 4.3.0 remains subject to the seven-day release-age guard.

## Wider UI failures and fixture corrections: 2026-10-05

A wider 67-test packaged run reaches the command's five-minute limit before
completion. It reports three Agents failures and a TypeScript hover failure.
The Changes restart test passes. Do not treat the partial run as a pass.

The Agents fixture calls `Date.now()` separately for its nested sessions.
A one-millisecond difference reverses their expected group order under the
documented newest-first rule. The fixture now uses one base time and explicit
relative timestamps. The context-menu test also depends on a rename in an
earlier test. An isolated run reproduces its missing-title failure. It now
uses its own session's current title. The keyboard test assumes Theia handles
Home, but the tree does not register that key. It now selects the directory
row, uses Arrow Right to expand it, and uses Arrow Down and Enter. Independent
runs verify all three cases. No app sorting or navigation code changes.

The unchanged hover test fails once in five isolated measurements. Five later
measurements with diagnostic records pass, but they do not establish a fix.
The test records focus, token bounds, visible hover count, and provider state
when that internal state is available. The saved passing record has focus
and a visible hover, but its provider state is unavailable. Do not use a null
provider field as proof of readiness or failure. The hover cause stays open.
No hover retry, fixed delay, or timeout increase occurs.

A later wider 68-test run completes with 66 passes, one failure, and one test
not run. The failure snapshot shows restored shell tabs and a collapsed
Agents directory with two sessions. The attention restart test assumes that
idle groups remain expanded. It now expands the group before selecting the
session. This changes test setup, not shell persistence. The final combined
affected suite passes all 34 Agents, attention, notice, sanitizer, and Changes
settings tests. It includes shell restoration, deletion, and idle cleanup.
The wider runs remain failure records. The original startup timeout and the
intermittent hover failure remain open release risks.

## Hover provider readiness: 2026-10-05

The test's original diagnostic looks for production class names that the build
shortens. It also reads a provider field that Monaco does not store on the
editor. The revised test locates the bound editor manager by its public methods
and reads Monaco's `ILanguageFeaturesService` from the editor's service scope.
The records now identify the TypeScript model and its hover provider count.
These internal lookups apply only to the test; no app code changes.

Ten measurements with the unchanged hover action reproduce two failures.
Every measurement starts with zero providers. Both failed measurements end
with one registered provider but no visible hover. The test now checks that
the TypeScript hover provider is registered before it performs the single
pointer action. It keeps the existing assertion timeout and checks actual
documentation with bold formatting. It adds no delay or hover retry. Ten
measurements with this readiness check pass. This supports a test setup race;
it does not establish an app-level hover fix or complete startup reliability.

The later 68-test wider run passes its first 60 tests, then reaches the same
five-minute command limit. The down-split navigation test takes about 72
seconds in that run. A separate 12-test navigation, shortcut, and Welcome
suite passes. Both navigation tests take about 12 seconds in the smaller
suite. The partial wider run is not a complete pass. Its slow navigation
measurement remains unexplained. The original second-launch timeout remains
open. Keep the earlier failed hover records as evidence of the test race.

## Copied icon and font archive checks: 2026-10-05

A read-only comparison verifies the exact lockfile SHA-512 archives for
Material Icon Theme 5.38.1, Monaco Editor Core 1.108.201, Codicons 0.0.45,
File Icons JS 1.0.3, and Font Awesome 4.7.0. All 1,252 copied material-icon
files match the published archive bytes. All 11 font files in the app payload
also match their published archives. The checked retained license files match
the archives. The five package README files are absent from the payload.
JetBrains Mono is a local system font in the verified terminal test, not a
font file supplied by this app payload.

A packaged regression checks the full material-icon copy file set and every
copied file's bytes against the shipped package. It rejects linked copy files,
checks the reviewed package version, and verifies the MIT license hash in the
notice inventory and stored notice text. All six build-evidence tests pass.
This checks copy integrity and notice retention, not all icon design rights.

The font counts cover one Monaco codicon font, one Codicons font, five fonts
in File Icons JS, and four Font Awesome files. File Icons JS's CSS identifies
Font Awesome, Mfizz, Devicons, file-icons, and Octicons font families. Its
package-level MIT text does not establish all five fonts' source releases or
license duties. Keep that copied-font review open. Codicons retains both
CC BY 4.0 and MIT terms, but attribution and trademark notices still need
review. Byte equality alone does not clear these duties. These asset gaps
remain separate from the six unresolved package notice entries.

The File Icons JS 1.0.3 registry record identifies source commit
`984e737370a5ce97b250b09f33f2571c585b8667`. All five shipped font files match
that commit's bytes. Its source manifest reports 1.0.2 rather than the registry
version 1.0.3. Keep this mismatch visible; the byte comparison does not make
the source manifest an exact-version release manifest. The source tree has
only its package MIT notice, not complete separate font terms.

The pinned README links a preview at Atom File Icons commit
`6714706f268e257100e03c9eb52819cb97ad570b`. Four font files match that commit:
Devopicons, file-icons, Font Awesome, and Mfixx. That tree has no Octicons font.
Its README links the separate icon projects without exact release identifiers.
Its package MIT notice does not establish the complete terms for each linked
font family. These source matches narrow provenance but do not clear the
remaining font-license and attribution checks.

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

### Local dependency fixes: 2026-10-01

The release-readiness branch replaces the legacy extractor with
`@xhmikosr/decompress` 11.1.4 through a small CommonJS adapter. The adapter only
loads the upstream extractor. Theia stays at 1.75.0. The override applies to
Theia CLI and extension deployment. npm 11 or later is required.

Regression tests reproduce escaping symlinks and outside hardlinks before the
change. Both tests pass after the change. Valid archive extraction also passes.
All three tests pass against the local macOS package dependencies.

The builder moves to 26.15.3. Its old tar copies disappear. All remaining tar
copies use 7.5.22. Electron dependency and builder pins use 42.11.8. The graph
uses serialize-javascript 7.1.2 and patched brace-expansion copies. The current
audit reports 48 findings: six low and 42 moderate. No high or critical finding
remains in this audit. The remaining findings still need reachability review.
An audit result does not prove that the app is secure.

The local production build and macOS package pass. Eight Electron startup tests,
six language-resource tests, 17 release checks, lint, types, and formatting pass.
The Electron startup tests use `--no-sandbox`; they do not verify the sandbox.
The React and React Native tests use small type fixtures. They prove nested
module resolution and real missing-module diagnostics, not full framework
compatibility or parity with the owner's project in VS Code.

GitHub private vulnerability reporting is enabled. `SECURITY.md` gives the
private report link. Maintainer metadata and final distribution notices remain
open. No binary is published, and the installed app stays unchanged.

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

### Local package preparation: 2026-10-02

The app manifest uses `mattgle` as author. No personal email is added.
The experimental Arch files use bundled Electron under `/opt/ai1` and a normal
launcher. The isolated tests check checksums, staging, invalid binary rejection,
and notice-gate rejection. No native `makepkg`, `namcap`, or pacman test is complete.
See [Arch package preparation](arch-package.md).

The macOS package now contains `resources/notices/manifest.json`, unchanged
license-text copies, and AI1's MIT text. The inventory reads the actual app files.
It finds 544 notice files. After legacy metadata parsing, 83 entries remain for
review. Many Theia and Lumino packages have no package-level license file.
Nested extension packages, fonts, native libraries, and source-offer duties still
need review. Do not replace missing license texts with inferred boilerplate.

The current audit remains at six low and 42 moderate findings. Runtime paths
are recorded in [dependency security review](dependency-security-review.md).
This is not an approval of those findings or a completed distribution review.

The latest secret scans pass for local Git history and current source. The
Explorer shortcut comparison requires one exact, file-scoped false-positive
exception. The source check finds no known personal identifier. The 118 commits
on the release branch and public `main` use the approved public identity.
Historical local branches and private-backup refs still contain original
identities. Keep those refs private. Do not publish them or merge them into
the clean public history.

### Continued security and notice review: 2026-10-03

A fresh audit reports 66 package findings before further updates. This includes
20 high findings from new `braces` and `http-cache-semantics` advisories. The older
no-high result is historical, not a current release result.

Compatible parser updates change only `fast-uri` 3.1.7 to 3.1.8 and `ip-address`
10.7.0 to 10.7.2. Three small regression tests reproduce the old defects and pass
after the updates. The current audit reports four low, 40 moderate, and 20 high
findings. See [dependency security review](dependency-security-review.md).

The notice inventory records parent license evidence only for internal module
folders with an exact matching package name and version. It does not cross a
`node_modules` boundary or use an unrelated parent's license. Two Socket.IO
module folders use the shipped parent MIT text. Four unresolved records clear.
The rebuilt app still has 544 notice files and 79 unresolved entries. Theia,
Lumino, extension assets, fonts, native libraries, and source duties remain open.
This change does not establish complete license compliance.

The local macOS bundle builds and passes signature verification and all six
language checks. All 763 workspace unit tests, three parser security tests,
three archive checks, and 22 release checks pass. Native validation and separate
publication approval remain required. The installed app stays unchanged.
The three parser security tests also pass against the packaged dependencies.
All 22 packaged Changes settings, folder-picker, appearance, tab-restore, and
terminal shortcut tests pass after the rebuild.

### DOMPurify runtime review: 2026-10-03

The app uses DOMPurify 3.4.16 through an exact dependency and root override.
Monaco's embedded 3.2.7 import also needs a build route; an npm override does
not replace embedded code. The checked-in esbuild configuration routes that
one file to a separate fixed sanitizer instance without changing upstream files.
The old embedded file remains as unused dependency source in the payload.
Review unused source and extension sanitizer copies separately.

The detached-handler regression fails before the fix and passes after it.
Normal core Markdown, Monaco Markdown and HTML, hook isolation, and a real
TypeScript hover pass in the packaged app. Both generated frontends contain
the fixed sanitizer and no 3.2.7 version assignment. The current audit reports
four low, 38 moderate, and 20 high findings. It no longer lists DOMPurify.
The notice inventory contains 543 notice files and 79 unresolved entries.
This update does not clear binary distribution, native sandbox, or live-hook gates.

Verification passes after the rebuild: 51 combined packaged UI tests, six language
checks, 763 workspace unit tests, four dependency-security checks, three archive
checks, and 22 release checks. Lint, types, formatting, and whitespace checks pass.
The packaged UI run includes Changes, terminal appearance and shortcuts, batch
restore, attention hooks, core Markdown, Monaco sanitization, and editor hovers.
The installed app stays unchanged. No commit, push, or publication occurs.

### Pinned Lumino notice evidence: 2026-10-05

The 13 shipped Lumino packages lack package-level license files. Their exact
release tags resolve to two source commits. The source package names, versions,
and BSD-3-Clause license values match the shipped metadata. Both commits contain
the same license bytes, including Jupyter and PhosphorJS copyright notices.

The app includes the unchanged source text in
`resources/third-party/lumino/LICENSE.txt`. Its SHA-256 is
`b0da99e8c73e7fdad117622971e6d16379fd01b5d0b60589de7133b6fec59422`.
`resources/third-party/supplements.json` maps each reviewed package version to
an immutable source URL and commit. The notice generator checks text hashes,
license values, and exact package names and versions. It rejects duplicate
review entries, escaping paths and links, and generated notice output as a source.
Unreviewed versions and license changes remain unresolved.

The rebuilt package contains 544 notice files and 66 unresolved entries, down
from 79. All 13 Lumino entries use their verified supplement. This clears their
missing-text records only. Theia license and source duties, other dependencies,
fonts, icons, native libraries, and extension assets still need review.

Signature verification, six language checks, six packaged sanitizer and hover
checks, 26 release checks, lint, and types pass. Four dependency-security tests
pass. The shared-cache regression remains pending because npm's release-age
guard blocks the candidate 4.3.0 update. The fresh audit reports four low,
38 moderate, and 12 high findings with an unchanged lockfile. The release gate
remains open. No app install, commit, push, or publication occurs.

### Theia EPL text and source statement: 2026-10-05

The Theia 1.75.0 release tag resolves to source commit
`52f32db6e32d1f88dbbbbde08c8a01ad75c53e11`. All 41 shipped Theia packages
with missing license texts match the names, versions, and license expressions
in that commit. Package evidence comes from `packages` and `dev-packages`,
not example applications. The notebook and test packages keep their original
`GPL-2.0` expression. The other entries use `GPL-2.0-only`.

The app includes the unchanged upstream `LICENSE-EPL`. Its SHA-256 is
`8c349f80764d0648e645f41ef23772a70c995a0924b5235f735f4a3d09df127c`.
The exact-version supplement map links each reviewed package to that text.
This evidence covers the EPL option. It does not claim that all alternative
license texts or copied third-party notices are present.

The app also includes `resources/third-party/theia/SOURCE.txt`. It states that
upstream source is available under EPL-2.0 and gives an immutable source link
and archive URL. EPL section 3.1(a) requires source availability and an
accompanying statement. Section 3.2 requires the license with source copies.
Section 3.3 requires preservation of notices. These requirements remain
separate from the missing-text inventory.

The rebuilt inventory has 545 notice files and 25 unresolved entries.
The 41 Theia missing-text records now use verified EPL evidence. This count
does not clear the release gate. Before distribution:

- Preserve the upstream release `NOTICE.md` and applicable copied-code notices.
  The upstream notice contains historical dependency versions. It does not
  replace an inventory of the actual app.
- Compare shipped Theia source and generated runtime code with upstream.
  Identify any modified works and provide their corresponding licensed source.
- Review the Monaco sanitizer build route and all other build transformations.
  The current upstream source link alone does not prove complete source coverage.
- Verify that recipients can obtain the source for the exact distributed app.
- Complete the remaining third-party, native-library, font, and icon reviews.

The local bundle builds. Signature verification, six language checks, six
packaged sanitizer checks, and 27 release checks pass. The packaged evidence
check verifies all 41 mappings and the unchanged EPL hash. Lint, formatting,
and whitespace checks pass. The installed app stays unchanged.
No commit, push, or publication occurs.

### Further five-part release review: 2026-10-05

License evidence now includes the complete `@tokenizer/token` 0.3.0 README
from its npm release commit. The README contains the MIT text and Borewit
copyright notice. The exact package metadata matches that source commit.
The app preserves all README bytes in a notice file and checks its SHA-256.
The app also includes Theia's unchanged `LICENSE-MIT.txt` and
`LICENSE-vscode.txt` from the pinned 1.75.0 release commit. Their source URLs
and hashes appear in the evidence map. These texts do not clear the remaining
upstream `NOTICE.md`, copied-code, or native-library duties.

The rebuilt inventory has 548 notice files and 24 unresolved entries.
A release regression now checks every checked-in supplement hash before
packaging. Package-time hash checks remain in place.

`scripts/review-theia-source.mjs` performs a read-only source comparison.
It fetches published Theia archives from exact registry lockfile entries.
It verifies SHA-512 integrity before reading archive contents in memory.
It compares published `src` and `lib` files with matching payload paths.
It rejects escaping file paths and links. It does not extract files to disk.

The packaged run checks 41 Theia 1.75.0 packages. It finds 4,359 equal files,
2,113 absent published files, and no changed files in the checked set.
Absent files are not supplied by the payload; they are not modified files.
The report does not cover added files, source maps, generated app bundles,
or Monaco's different-version package. The sanitizer build route and complete
corresponding-source coverage remain separate open checks.

Repeat the source check with:

```sh
node scripts/review-theia-source.mjs <app-payload> package-lock.json
```

The fresh security audit remains at four low, 38 moderate, and 12 high findings.
New dependency regressions check normal proxy event settlement and Theia's
no-buffer UUID v5 caller. Neither check clears all affected callers.
The cache fix remains inside the release-age waiting period.

Isolated interactive agent startup sends no input, credentials, model prompt,
or trust approval. It verifies no hook lifecycle event. Full live-hook checks
remain open. See `docs/terminal-attention.md` for the exact limits.

The local bundle builds and passes signature verification and six language
checks. All 30 release checks pass. No installed app, global agent setting,
trust decision, dependency version, or lockfile changes in this review.
All work stays local and unpublished.

The latest rebuild also passes 763 workspace unit tests, three archive-security
checks, and seven dependency-security checks in both development and packaged
resolution. The cache case remains a pending defect in development and is
skipped in the packaged dependency run. Lint, types, formatting, whitespace,
and both redacted secret scans pass. The source comparison repeats against
the latest bundle without changed files in its checked set.

The final source-check guards also reject an empty package inventory and
package names that do not match their folders. All 31 release checks pass.

The latest combined packaged UI run has 50 passes and one failure. Changes
settings times out while waiting for the second app launch to create a window.
The trace does not show a settings assertion failure. Cleanup also times out.
A separate settings run passes in 19.5 seconds. Five further isolated runs
all pass in 19.6–19.9 seconds. A repeat of the original combined suite passes
all 51 tests in 2.7 minutes with the same bundle and test settings.
The startup timeout does not reproduce in these follow-up runs. Its cause
remains unknown. The passing rerun does not prove a fix or clear that risk.
No app behavior, timeout, delay, or retry changes to hide the failure.

### Upstream notice and bundle-input evidence: 2026-10-05

The app now includes the complete unchanged Theia 1.75.0 `NOTICE.md` from
commit `52f32db6e32d1f88dbbbbde08c8a01ad75c53e11`. Its SHA-256 is
`9911a1d6c0777777f94c100c1760f85a313f7fe15b95c4a66e552a74b60a7d5d`.
The evidence map and release tests check those bytes. Formatting tools exclude
this upstream file to preserve it. Its historical dependency list does not
replace the actual app inventory or complete copied-code notice review.

The production build also records esbuild input and output metadata in
`resources/release/build-inputs.json`. This generated file ships with the
local bundle but stays out of source control. The checked-in report generator
uses relative paths, including virtual native-module input names. It records
dependency identities, byte contributions, external imports, and output hashes.
The 20 reported output hashes match the actual packaged files. The report
contains no local home-directory or temporary-directory paths.

The report shows no contributing braces or HTTP-cache-semantics inputs in
the recorded builds. It shows diff 5.2.2, UUID 7.0.3 and 8.3.2, once 1.1.2,
and DOMPurify 3.4.16. See `docs/dependency-security-review.md` for the output
paths and scope limits. This evidence does not clear dynamic loading, copied
assets, external dependencies, source duties, or build-tool exposure.

The rebuilt notice inventory has 549 notice files and 24 unresolved entries.
Signature verification, six language checks, and 33 release checks pass.
All work remains local. No app install, commit, push, or publication occurs.

All nine combined packaged evidence, sanitizer, and Changes settings tests
pass. The evidence tests verify every recorded output hash and the complete
upstream notice hash. Lint, types, formatting, whitespace, and three archive
checks pass. The earlier intermittent startup failure remains a separate
documented risk; this passing settings run does not establish its cause.
