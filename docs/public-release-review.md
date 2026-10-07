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

## Signed source commits: 2026-10-07

The owner approves the pending source commits and continued release work.
Signed commits separate the Agents tree, terminal input, release tooling,
isolated test fixtures, and MCP credential guard. The source and Git-history
secret scans pass with full redaction before staging. The retained upstream
FFmpeg patch has a file-specific whitespace exception. Its byte checks pass;
the exception does not change the upstream patch.

This source checkpoint has 822 passing workspace unit tests, 93 passing release
checks, 17 passing offline editor checks, and 10 passing hook fixture checks.
Lint, types, formatting, and whitespace checks pass. The strict dependency and
archive checks retain three cache failures. Packaged guard checks are the next
step. No push, merge, installed-app replacement, or binary publication occurs
at this checkpoint.

## Copied helper permissions follow-up: 2026-10-07

The earlier local package retains mode `0777` for the native helpers copied by
Theia. The plugin's copy function sets it; packaging preserves it. The source
fix restricts only the known packaged helpers before signing. Executables use
`0755`; the PTY module uses `0644`. Hash checks preserve their bytes. The Arch
staging mode guard stays unchanged.

The rebuilt local package passes signing, six language-resource checks, 17
package-evidence checks, and one isolated persistent-terminal check. The Linux
staging fixture rejects unsafe modes and then accepts the prepared helpers.
These checks do not establish native Omarchy support or complete source duties.
The installed app stays unchanged. No binary is published.

The follow-up also restricts the two packaged branding logo copies to `0644`.
Their source assets and bytes stay unchanged. The final signed package's full
payload scan finds no unsafe modes across 16,752 files and 3,082 directories.
All four native helper files match their lockfile-verified published archives.
The source changes pass all 107 release-script checks. Complete build provenance
and source duties remain separate open gates.
All 18 final package-evidence checks pass, including the full mode regression.

## Packaged MCP guard follow-up: 2026-10-07

The local test app rebuild passes production compilation, ad-hoc signing, and
strict signature verification. Six language-resource checks, 14 strict
packaged MCP caller checks, and 16 package-evidence checks pass. The package
contains the guard's exact compiled modules. Its generated backend loads the
guard module after Theia's MCP module. All six source commit signatures verify
against the configured public key with a temporary allowed-signers file. The
verification does not change Git settings.

These MCP checks use a memory store and synthetic responses. They do not
establish a live login result. One isolated packaged Agents startup check also
passes with the normal backend, exit code 0, and no signal. This is not a full
UI run. The package retains 571 notice files and five
unresolved entries. Cache security and the other recorded release gates stay
open. The installed app stays unchanged. No binary is published.

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

## Lifecycle and teardown follow-up: 2026-10-07

The initial packaged lifecycle baseline passes five launches in each backend
mode. A failing pure regression then establishes a teardown coverage gap:
global teardown selects the development plugin-host path even for a packaged
run. The resolver now selects the supplied packaged resource folder. It keeps
the existing orphan and suite-start filters. Tests exclude the installed app,
development app, and older processes. Teardown still stops no process.

Lifecycle records now include the phase and separate stdout/stderr byte counts.
The observer records fixed error markers and bounded stack-symbol names from
both streams. It retains no raw output, paths, arguments, or credentials.
Native fatal output fails the verdict even when the main process exits zero.
The documented shared-mode exit code 1 remains valid only without a signal
or native fatal marker. All nine pure diagnostic and process-selection fixtures
pass. End-to-end types and lint pass.

The longer mixed-mode run passes four five-launch groups, then records a
shared-mode `SIGABRT` with `FATAL ERROR` and `napi_fatal_error` during quit.
The following forked group completes one launch and stops at the next
`first-window` phase when the command reaches its 120-second outer limit.
That group has no complete test verdict. This is not evidence of a new
first-window cause or a successful 30-launch run. The saved mixed-mode records
contain 11 shared launches, including the abort, and 12 forked attempts,
including one incomplete attempt.

A separate forked-only run has sufficient time for the existing test and
cleanup deadlines. All three groups pass: 15 ready launches and clean normal
exits, with no recorded native fatal marker or termination signal. First-window
times range from 689 to 944 ms. No app timeout, launch retry, dependency,
or production behavior changes. The shared native shutdown failure, incomplete
mixed run, and original startup cause remain open. Passing isolated repetitions
do not establish complete startup reliability.

The same parallel review adds an offline external-load checker and pending
proxy cancellation regressions. All 123 release-script fixtures pass. The
separate cancellation command has four passes and four hard failures in the
package. Source identity success does not clear that runtime gate. See
`release-source-follow-up.md` and `dependency-security-review.md` for scope.
The installed app stays unchanged. No binary is published.

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

## Recorded Monaco sanitizer transformation: 2026-10-05

The browser build now records the exact replacement module supplied to esbuild.
The plugin uses a relative import for the selected DOMPurify file rather than
an absolute local path. It still creates a separate sanitizer instance and
leaves the original embedded source unchanged. The report includes the original
source hash, replacement module text and hash, selected DOMPurify file hash,
and selected package identity. Node and Electron builds have no recorded
sanitizer transformations. This is not a snapshot of every build input.

The report rejects duplicate transformations, paths outside the repository,
missing metadata inputs, invalid byte records, local repository paths in
replacement text, and byte counts that differ from esbuild metadata. The
regression verifies that unrelated sanitizer paths remain unchanged and that
the old sanitizer does not execute. The packaged check links both sanitizer
paths to positive browser output contributions and verifies their retained
file bytes against the recorded hashes.

The exact lockfile archives pass SHA-512 verification. Monaco Editor Core
1.108.201's original embedded file has 63,063 bytes and SHA-256
`7b0d9a951d2d5b886080ceb56eed060bbffc2ca3d88e7131e6c18f749fd32661`.
DOMPurify 3.4.16's selected `dist/purify.cjs.js` has 84,452 bytes and SHA-256
`1144c3ba99465d58ff93ab2419ebd99b7d7e12525b1ca4f45308771acf34cfec`.
Both files match the published archive bytes and the payload bytes.

The recorded replacement module is 114 bytes with SHA-256
`1688c70114511e9abba018dc204a152ff14c9ea704c5eaf75647a15fd5317e63`:

```js
import createDOMPurify from "../../../../../../../dompurify/dist/purify.cjs.js";
export default createDOMPurify();
```

All 42 release checks pass. The local bundle builds, and its six language
checks pass. All 14 combined packaged evidence, sanitizer, and Changes settings
tests pass. Normal core and Monaco Markdown, executable-HTML rejection, hook
isolation, and TypeScript hover still pass. The cache defect remains pending.
This result closes the missing exact sanitizer-transformation record, not
the complete corresponding-source, security, or binary-release gates.

## Remaining high-advisory caller evidence: 2026-10-05

Bounded development fixtures reproduce nested-brace stack exhaustion through
Chokidar's pattern helper and Fast Glob's task generator. They use a synthetic
6,003-character pattern and a 256 KB child-process stack. Neither starts a
filesystem scan or watcher. Disabling the corresponding expansion option
accepts the same pattern. This records affected caller paths, not a fix or an
app exploit. The generated shell-integration copy rule has a fixed glob.
The Braces high finding remains open.

A Got loopback fixture with no HTTP cache makes two origin requests. An
explicit shared-cache fixture stalls after the first origin request and does
not reach the max-stale check. Its bounded child process stops after eight
seconds under Node 24.15.0. Do not use that hang as a disclosure result.
The policy-level cache defect and optional cached caller review remain open.
See `dependency-security-review.md` for the exact dependency paths and limits.

Further isolated checks complete the response through Cacheable Request and
Got's stream API. The cached Got promise reports an aborted flag and its
promise handler returns early. The source of that flag remains unverified.
The downloader uses the stream API. Both the direct wrapper and stream API
reuse the first synthetic cookie response under a max-stale second request
with an explicitly enabled shared cache. Only one origin request occurs.
Two pending loopback regressions require a fresh second origin response.
They do not use an external network, real cookies, or credentials. The
current app's use of a shared HTTP cache is not established. Keep the high
finding open and the npm release-age guard enabled.

## Packaged FFmpeg codec mismatch: 2026-10-05

Theia's rebuild replaces the development Electron FFmpeg library with its
clean variant. Electron Builder then downloads a separate Electron runtime
for packaging. The current macOS build does not copy the cleaned library
into that runtime or check the packaged library before signing.

The development and cached clean libraries have 1,206,816 bytes and SHA-256
`a68b543f754933780a4c0266d0eab33f8de401151c4866219c6933ab91b6e03c`.
The packaged library has 2,213,616 bytes and SHA-256
`def7ec242f4ce81467c04b032c67be5d097e3d2fb15a7e38abd290bd82f54216`.
Theia's codec check reports 13 other codecs plus H.264 and AAC in the packaged
library and returns a failure. The earlier development codec checks do not
establish the packaged app's codec policy or distribution rights.

The installed `/Applications/AI1.app` stays unchanged. No library replacement
occurs during this check. Choosing the clean packaged library removes H.264
and AAC support. Keeping those codecs requires a separate distribution-rights
review. The owner chooses the clean codec policy on 2026-10-06. See the
implementation and validation below.
FFmpeg license, corresponding-source, and native release checks also remain
open. A codec-name check alone does not clear those duties.

## Clean packaged FFmpeg policy: 2026-10-06

The owner approves the clean codec set for the packaged app. The shared
Electron Builder `afterPack` hook now prepares FFmpeg before notice generation
and signing. It supports the pinned Electron 42.11.8 macOS arm64 and Linux x64
targets. It rejects other versions and targets. Native codec inspection also
requires the build host to match the target platform and architecture.

The hook downloads the official release archive through Electron Get with a
pinned checksum. It independently checks the archive bytes, then parses those
same bytes without extracting paths to disk. The pinned SHA-256 values are:

- `ffmpeg-v42.11.8-darwin-arm64.zip`:
  `ac0ee66fa9416ff93b06124a2ea89868b393d1388276ce963a9706889c142a21`.
- `ffmpeg-v42.11.8-linux-x64.zip`:
  `c6585e86f3980291c1b598a47c338439ea400bce5f5198149f9706962caa4b7b`.

Both values come from the official 42.11.8 release `SHASUMS256.txt`. The ZIP
must contain one regular library file at the exact expected path. The first
real build stops before signing because the installed Unzipper API has no
entry `type` field. The corrected check uses its ZIP file attributes. A
regression verifies that format and rejects duplicates, links, directories,
empty entries, and unexpected paths. The archive hash guard stays unchanged.

Replacement writes a temporary file next to the packaged library. It preserves
the destination mode and checks the temporary library's codec names. It then
replaces the library atomically and checks the installed bytes and codecs.
Invalid archives, failed inspection, or H.264/AAC codecs stop packaging.
Before replacement, failures preserve the original library. After replacement,
any failed byte or codec check stops packaging before signing. Framework
links may resolve only within the app. Temporary-file cleanup does not remove
other app files.

The app includes `resources/release/ffmpeg.json` with target identity, archive
checksum, pre-signing library hash, and codec names. The record explicitly
limits its library hash to bytes before signing. Signing can change Mach-O
bytes. A packaged regression inspects the final signed library instead of
assuming that its hash remains unchanged. The final macOS library has 13
checked codecs with H.264 and AAC absent.

The local build and strict ad-hoc signature verification pass. Its six language
checks pass. All 25 combined packaged codec, source-evidence, image-preview,
Markdown, restart-settings, and terminal-shortcut tests pass. The image-preview
fixture now uses the packaged executable when supplied. PNG and SVG previews
and normal text editing remain usable. The installed app stays unchanged.
No binary publication occurs. Native Linux execution, other runtime behavior,
FFmpeg licensing, and corresponding-source duties remain open.
Unit tests, all 52 release checks, three archive checks, lint, types, formatting,
whitespace checks, and both redacted secret scans pass. The lockfile hash stays
unchanged. The final notice inventory stays at 566 files and six unresolved
entries. The prepared and signed FFmpeg library hashes match in this build;
the evidence still marks that recorded hash as pre-signing rather than assuming
that all signing methods preserve the bytes.

## Complete native runtime notices: 2026-10-06

The original Electron distribution includes `LICENSE` and
`LICENSES.chromium.html`. The earlier packaged app omits the Chromium file.
The shared packaging hook now preserves both complete files in
`resources/third-party/electron/` before notice generation and signing.
It checks the installed runtime version and both source hashes. It rejects
changed destination files and links outside the payload. Matching destination
files stay unchanged. The notice inventory also recognizes the standard plural
filename `LICENSES.chromium.html`.

The official Electron 42.11.8 macOS arm64 and Linux x64 release archives both
contain identical notice bytes. Their verified archive SHA-256 values are:

- macOS arm64:
  `9e2d2d2c3706e522ba2b32556b7c9dd06a1c7b9925fc1c282f6f8563ac9b0f2f`.
- Linux x64:
  `2bb665f0884f4ce6b7eb4fa7e23435616458e61c6548c9bfcc69816126684e83`.

The complete Electron `LICENSE` has 1,096 bytes and SHA-256
`5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d`.
The complete Chromium notice has 20,008,860 bytes and SHA-256
`ca0a3f71df977796bf39a99472783c1ce9378bf4d8f4142a95048c3843980415`.
Both files match the installed macOS distribution. The app records their hashes
and sizes in `resources/release/electron-notices.json`. The inventory retains
an exact copy of each file.

The Electron release tag resolves to source commit
`b50ff46306a0bc5b4849cb2384c217c8f4c790da`. Its `DEPS` file pins Chromium
148.0.7778.280. That Chromium revision pins FFmpeg commit
`f45bab87ce4c5fafc67fd53fcde777578d01bfa0`. The FFmpeg metadata declares
LGPL 2.1 and identifies the Chromium-specific fork. Its `CREDITS.chromium`
has 46,468 bytes and SHA-256
`a4f057d42d8a93077a37d2381a8ebf47e9e0ce2a80336d6ba1534767634ce0d1`.
The decoded FFmpeg license block in the shipped Chromium notice matches those
source bytes exactly. This establishes the declared source chain and retained
notice text. It does not establish reproducible binary equivalence or complete
corresponding-source availability.

All 59 release checks, lint, and types pass. The local package build and its six
language checks pass. The combined packaged source-evidence, native-notice,
codec, image-preview, Markdown, and restart-settings tests pass. The final
notice inventory has 568 files and six unresolved entries. The clean codec
policy stays in place. The installed app stays unchanged. No binary publication
occurs. Native Linux execution and remaining license and source duties stay open.

### Clean FFmpeg source settings

At Electron commit `b50ff46306a0bc5b4849cb2384c217c8f4c790da`,
[`build/args/ffmpeg.gn`](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/build/args/ffmpeg.gn)
imports the common settings, then selects `ffmpeg_branding = "Chromium"`,
`proprietary_codecs = false`, and `is_component_ffmpeg = true`. The common
settings instead select Chrome branding and enable proprietary codecs. The
separate clean settings explain why the normal packaged runtime requires the
verified library replacement.

At FFmpeg commit `f45bab87ce4c5fafc67fd53fcde777578d01bfa0`, both
`chromium/config/Chromium/mac/arm64/config.h` and
`chromium/config/Chromium/linux/x64/config.h` declare
`FFMPEG_LICENSE "LGPL version 2.1 or later"`. Both set `CONFIG_GPL`,
`CONFIG_GPLV3`, `CONFIG_VERSION3`, and `CONFIG_NONFREE` to zero.
Electron's `patches/ffmpeg/.patches` lists one patch,
`link_with_loader_path.patch`. That patch changes the macOS shared library's
install name from `@rpath/libffmpeg.dylib` to `@loader_path/libffmpeg.dylib`.
The patch does not change the listed license flags.

These files establish declared source settings only. They do not prove that
the distributed library uses every declared input without other changes.
The review still needs the exact source package, applied patches, build inputs,
build instructions, and applicable replacement or relinking materials.
Retained notices and a codec check do not clear that release gate.

## All-area release review: 2026-10-06

### Parallel follow-up: 2026-10-07

The coordinated review covers all six existing backlog areas. Separate workers
check security, source and licenses, hooks, editor behavior, and Omarchy staging.
Electron tests run in sequence against one unchanged local package.

The restart failure's macOS crash record identifies `watcher.node` callbacks
during Node environment cleanup. Another record identifies `pty.node` exit
callbacks during cleanup. These are native shutdown observations, not proof of
the cause of the subsequent first-window timeout.

Three repeated baseline settings and attention suites pass 45 tests. A separate
lifecycle comparison checks five launches per test in both backend modes.
All 15 initial forked-backend launches exit with code zero and no signal.
The shared-backend tests initially fail an incorrect zero-exit expectation:
Theia's backend `gracefulShutdown()` deliberately exits with code one. That exit
code alone does not reproduce a native crash. The corrected diagnostic accepts
only zero or the documented one in shared mode; any exit signal still fails.
The normal forked main process must exit with code zero.

The strengthened lifecycle fixture opens three nested Git repositories and
creates real watcher events before quit. Three repeated lifecycle and attention
suites pass 48 tests, including 30 launches across both modes. The historical
native crash does not reproduce in those runs. No delay, retry, or longer timeout
is added. The original first-window timeout is not declared fixed.

The theme fixture has a separate reproducible settings defect. It replaces
the profile file and removes `window.titleBarStyle`. Theia can then show its
required-restart dialog, which blocks the next terminal test. The regression
fails with the style removed. The fixture now changes only `workbench.colorTheme`
and preserves title-bar and unrelated preferences. Theme, Control+C, shell
restoration, and deletion checks pass in all three repeated suites.

The settings restart test now uses the shipped default forked backend rather
than the test-only `--no-cluster` flag. It retains the same launch order and
timeout values and adds clean main-process exit assertions. The shared-mode
lifecycle diagnostic remains available separately.

The normal-backend settings test then passes ten repeated runs with traces.
Each run uses four launches with the same profile and checks a zero exit code
and no signal from each main process. All 40 launches pass. The suite takes
3.5 minutes, with each test between 20.0 and 20.8 seconds. The earlier disposal
assertion error is a fixture error: retain the child handle before Playwright
closes and disposes its application object. No native crash or first-window
timeout appears in this run. The original timeout cause remains open.

The hook integration fixture has ten passing checks through the actual helper
and isolated tmux panes. It does not verify live CLI events. Isolated Codex
startup reaches the login menu because its temporary home has no test login.
The existing home has an authentication file, whose content and validity remain
unread. Gemini startup reaches the workspace trust question. Neither probe
submits input or changes login, configuration, permission, or trust state.
See `terminal-attention.md` for the exact remaining approval requirements.

The Arch staging review has 26 passing checks. Source notice paths now use the
actual unpacked-app root, and copied notice text uses the notice-output root.
Real-generator fixtures verify both runtime and package notices. Path, link,
file-mode, and checksum guards reject unsafe inputs. These results do not prove
native Omarchy execution or pacman lifecycle behavior. See `arch-package.md`.

Ten offline editor checks pass for nested project selection, imports, JSX
diagnostics, hover, definitions, completion, edits, and ESLint fixes. React uses
installed types; React Native still uses a declaration fixture. The new UI
check passes twice after the fixture uses canonical paths and standard Quick
Open. It also checks definitions, actual pointer-hover content, React
diagnostics, and separate project save fixes. The command-palette Show Hover
path still shows no hover in the fixture and needs separate diagnosis.
The owner-project comparison remains open. See `editor-release-follow-up.md`.

The source follow-up verifies the exact Electron FFmpeg patch, its application
to the selected upstream build file, and cryptographic publication provenance
for both clean archives. It does not verify complete compiler inputs or
modified-library operation. See `release-source-follow-up.md` for exact hashes,
source revisions, candidate build instructions, and the remaining limits.

The build now captures actual outer `onLoad` bytes from the polyfill and native
plugins. The production build passes and records all 14 outer polyfills, four
native wrappers, four backend transformations, and the existing sanitizer
transformation. Generator hashes and loader hashes stay separate from disk
source hashes. No local absolute path appears in the report. Nested generator
inputs, default-loader snapshots, external loads, and complete source duties
remain unverified. See `release-source-follow-up.md` for the exact boundary.

MCP SDK 1.31.0 is now locked and installed. The SDK change updates only its
version, archive URL, and integrity. All 701 installed SDK files match the
verified archive. The prior Proxy Addr update remains unchanged. Install
scripts stay disabled, and the seven-day release guard stays active.
The lockfile SHA-256 is
`c3c82bc1c7595c51eda37b559609c3d4c4d8df1414e336b7ecd764833bdb894c`.
The initial package has SDK 1.30.0. The later local rebuild below includes
SDK 1.31.0.

The repeated strict MCP test passes six checks and fails three issuerless
credential checks. The full development dependency suite has 27 passes and
six pending failures. Strict security and archive checks have 30 passes and
six hard failures: three MCP cases and three guarded cache cases. A successful
exit from the non-strict suite does not clear those defects. The fresh audit
has 63 findings and no SDK entry. The production-only audit has 41 findings
and no high or critical entry. See `dependency-security-review.md`.

The MCP integration review confirms the extension is reachable through
`@theia/plugin-ext`, despite the absence of a direct AI1 application dependency.
Both development and packaged generated entry points load its frontend,
backend, and Electron callback modules. A connection-scoped provider-factory
replacement can restrict the existing feature without enabling a new one.
Synthetic manager checks confirm that a live authorization-server pin change
clears that server's stored credentials. Unchanged configuration preserves
records. The proposed guard can refuse unsafe state without changing settings
or deleting records, but blocking unpinned static clients changes supported
login behavior. At this review stage, that policy awaits owner approval. No
guard is implemented at this stage, and no live configuration or stored
credential changes occur.

The later approved source guard replaces the connection-scoped provider factory.
It refuses issuerless credentials and unpinned static clients. It checks cached
discovery and preserves unsafe stored records on refusal. All 14 guarded MCP
caller checks and 822 workspace unit tests pass. Strict dependency, sanitizer,
and archive checks now have 38 passes and three cache failures. The local
production build includes the guard. The packaged app still needs a rebuild
and checks for this change. Live login, configuration, stored credentials, and
the installed app stay unchanged. See the approved-guard section in
`dependency-security-review.md` for recovery limits and exact test scope.

Repository lint, all workspace type checks, and 80 release-script tests pass.
The subsequent workspace unit run passes 771 tests. Three archive rejection
checks, ten hook integration checks, and ten offline editor checks also pass.
The redacted Git-history and source-file secret scans pass with the existing
Gitleaks executable. These results precede the final dependency update and
transformed-source follow-up. Repeat applicable checks after those changes.

The subsequent local package includes SDK 1.31.0 and the captured build report.
Ad-hoc signing and strict signature verification pass. All six packaged
language-resource checks pass. The notice inventory still has 571 files and
five unresolved entries. The installed app remains unchanged.

All 84 release-script checks pass after integration. The updated packaged
dependency suite has 21 passes, nine build-only skips, and three pending MCP
failures. Those failures remain release blockers; its zero exit status does
not clear them. Repository lint, all workspace type checks, formatting, both
redacted secret scans, and diff whitespace checks pass again. The wider UI
suite follows this rebuild and needs its own complete result.

The subsequent wider run completes 153 tests in 14.5 minutes: 146 pass and
seven fail. The corrected nested-editor command check is deliberately separate.
Some legacy launch helpers start the development entry point despite the
packaged environment variables. This is a mixed wider run, not proof that all
153 checks exercise the installed test package.

All new source-capture and SDK package checks pass. Changes settings restart,
both lifecycle modes, terminal attention, the theme-preservation regression,
Control+C, shell restoration, folder picking, mixed-tab restoration, and
Shift+Enter checks pass. No startup timeout or native crash appears in this run.

Four failures occur in `m2-agents.spec.ts`: a terminal locator matches two
widgets; a later test cannot find its expected session after worker restart;
another assumes one terminal but finds four; and the prompt test does not see
working state. Two browser tests fail: an agent connection hides or removes the
selected terminal input, and a broad Welcome selector matches both the AI1
Welcome tab and a browser tab. The Markdown documentation hover also fails.
The causes remain under review. Fixture and app faults stay separate until
tests establish the correct boundary. The wider run is not a release pass.

The command-palette hover review identifies a separate selector defect:
`Show Hover` selects the debug command, while Monaco's action is
`Show or Focus Hover`. Five offline command checks pass. The corrected UI test
requires dispatch of `editor.action.showHover` and actual hover content.
Its UI validation follows the wider run.

The browser review confirms that its broad Welcome locator matches the app's
Welcome widget and the browser tab. It now selects connected browser-agent tabs.
The focus regression records a stable terminal ID and blur events. It requires
the agent tab to remain in the background while navigation completes.
The unchanged package's `BrowserTabs.open()` calls `revealWidget` for
`activate: false`, which can select that tab and hide the terminal. A local
source change removes that reveal call and preserves normal activation.
Lint and types pass. The unchanged package remains the failing-control input;
the corrected runtime regression and rebuilt app still need validation.

The strengthened background-tab test fails against the unchanged package.
After agent navigation and title completion, its tab still has
`lm-mod-current`. This proves the selection defect at the actual agent
connection boundary. The next local rebuild includes the no-reveal source
change and requires a separate passing regression. No runtime success is
claimed from source inspection alone.

The legacy Agents fixtures now create separate state per test and scope
terminal assertions to the session widget. The second-click check performs
both clicks itself. Session creation checks the new service record rather than
an unrelated tab count. Fake service events hold working and completion state
until each UI assertion completes. A temporary home, zsh and bash startup
files, and a blocked executable prevent installed OpenCode calls. Packaged
launches verify the actual executable path. Lint, types, and shell fixture
checks pass; Electron validation remains separate.

The corrected editor and Markdown suites pass all 21 checks across three
sequential repetitions against the rebuilt SDK package. Both pointer hover and
the exact `editor.action.showHover` command return actual TypeScript content.
The documentation test renders the expected bold text. All sanitizer tests
remain unchanged. The missed original first-hover event has no proven
low-level cause. Hide Hover performs phase cleanup. Escape cleanup fails in
two separate probes and remains a key-event investigation, not a verified
app defect. See `editor-release-follow-up.md` for exact evidence.

The no-reveal rebuild passes strict signature verification and six language
checks. The next 53-test failure-area suite has 50 passes, three failures,
and two cleanup-hook errors. It takes 19 minutes. All seven original failure
cases now pass, including the background-tab check with no terminal blur.
Normal browser activation, two connected agents, real editor hover content,
and Markdown rendering also pass.

The remaining failures differ from the original seven. Two Agents lifecycle
tests wait for a DOM Close menu after opening an Electron sidebar context menu.
Their cleanup also waits until its existing timeout. A browser-control test
times out during trace-recording setup, without a test-body assertion failure.
The affected workers continue diagnosis. No timeout, delay, retry, trace
disablement, or success claim hides those failures. The wider release gate
remains open until a complete valid run passes.

Offline review of the browser trace corrects the initial timeout description.
The test body runs: CDP connection and navigation complete, then the real click
waits for actionability. Screenshot and disconnect calls do not start.
All three guest snapshots have a zero-width, zero-height viewport. The trace
fixture's timeout label does not identify the original wait.
The no-reveal change therefore preserves owner focus but exposes a separate
hidden-guest sizing defect. Background guests must retain a usable viewport
without selecting their tab. The strengthened probe checks nonzero dimensions
and keeps the actual click and screenshot. Source remediation remains under
review; revealing the tab or forcing a click is not an accepted substitute.

Both corrected Agents lifecycle checks pass after the fixture uses the real
`ApplicationShell.closeWidget` path instead of a native menu. All 11 Agents
checks pass once, and both lifecycle checks pass again. Saved observations
prove disposal, shell removal, a different live instance on reopening, and
permission notices while the widget is closed. No teardown stall appears.
The shared-backend main process exits with code one and no signal. The fixture
now uses the normal forked backend and requires a zero main-process exit code;
its subsequent runtime validation remains separate.

The Escape observe and strict probes also pass. All four project checks show
one Escape reaching the focused native editor input with no competing context,
and closing the hover before Hide Hover. This verifies normal editor focus,
not hover-widget focus or competing UI. The two earlier probe failures remain
unexplained. No Escape app defect or source fix is established.

The normal-backend Agents run then passes all 11 tests in 1.1 minutes.
Each main process exits with code zero and no signal. The retained child handle
supports the exit assertions after Playwright closes its application object.
Both widget-lifecycle tests pass, and no teardown stall appears. The missing
tmux socket before initial session creation is an expected fixture state, not
a failed cleanup or app process. The hidden-guest browser defect remains open.
Shutdown attachments now retain only fixed error markers and exit status.
They do not retain raw stderr, URLs, or terminal content. Scoped lint, types,
formatting, and whitespace checks pass after this diagnostic-only change.

The stronger old-package geometry probe fails in 126 ms. Guest, widget,
viewport, and webview dimensions are zero despite a visible parent measuring
1,578 by 1,414 pixels. A CSS candidate keeps inactive browser widgets sized
with parent-relative width and height, `visibility: hidden`, and no pointer
input. Three real-Lumino headless geometry checks and 19 viewport/handover
unit checks pass. These are not Electron guest-control proof.

The signed candidate package passes its language checks, but all six repeated
real-control and focus probes reach the existing 120-second timeout. The CSS
candidate is not cleared. The next investigation inspects the blocked action
and guest visibility or frame scheduling. Geometry alone must not replace
actual clicks, screenshots, and owner-focus assertions. No repeated long probe
run follows until a smaller diagnostic establishes the cause.

The current independent source checks pass: 771 workspace unit tests,
84 release-script tests, 17 combined offline editor tests, and ten hook
integration tests. Repository lint, workspace types, formatting including CSS,
both redacted secret scans, and whitespace checks also pass. They do not clear
the failed browser runtime checks or the other release blockers.

Further native probes confirm that the CSS candidate preserves geometry but
does not produce animation-frame callbacks. Transparency produces frames and
real control, but the click blurs the terminal. Host `inert` does not prevent
that blur. Repeating native background-throttling configuration after hiding
resumes frames, but the click still blurs the terminal and screenshot capture
does not complete in the bounded probe.

Same-guest focus emulation and active lifecycle commands do not resume frames
in the tested state. Native hidden capture returns `UnknownVizError`.
These observations reject the tested candidates, not all possible designs.
An offscreen fixture created before navigation supports control and capture,
but it uses a different page. Existing attached guests have no tested public
API path that changes their rendering backend while retaining the same DOM,
workers, history entries, target, and CDP sessions. The new-page prototype is
not accepted as a migration fix.

Only the failed no-reveal and hidden-CSS source candidates are removed. The
regression tests and evidence remain. The restored local package passes lint,
types, strict signature verification, and the real browser-control test in
5.8 seconds. Clicks and screenshots work again under the original selected-tab
behavior. Background control with unchanged owner focus remains blocked.
The installed app remains unchanged. A larger presentation or input redesign
requires owner approval and its own design review. No source or binary
publication follows these incomplete runtime results.

The embedded font-name review checks seven installed files against verified
npm archive bytes and 13 pinned source inputs against their hashes. Font Awesome
4.7.0 has a 2016 Dave Gandy copyright field and a license URL, but no license
description field. MFixx, DevOpicons, and Octicons have no reviewed copyright
or license-description field. The IcoMoon generation credit is not permission.
These name-table observations do not establish complete font terms.

The review supports only a source-identity proposal for the File Icons JS
Font Awesome WOFF2 file. It does not justify a new license supplement. Modified
font terms, original Octicons provenance, and glyph or trademark rights remain
open. See `release-source-follow-up.md` and `font-metadata/review.json` under
the retained third-party resources. All 93 release-script checks pass after
the nine metadata tests join the standard command. Lint, formatting, both
redacted secret scans, and whitespace checks pass again.

The owner chooses an Orca comparison before a browser design decision.
That review needs the Orca repository path or URL. No larger browser change
or MCP credential-policy change starts without the required owner decision.

### Dependency security

The fresh audit identifies a new critical Proxy Addr finding and a moderate
Sprintf JS finding. Proxy Addr 2.0.8 fixes the reproduced cross-family trust
defect through both the package and Express's request IP getters. The update
changes one dependency. The final audit has four low, 47 moderate, and 12 high
findings, with no critical finding. See `dependency-security-review.md` for
the caller tests, exact source comparison, and remaining limits.

### Notices and fonts

Packaging now excludes only Fast URI's unused private benchmark folder. Its
ISC manifest lacks complete terms and differs from the parent BSD license.
No benchmark file contributes to the recorded builds. Runtime URI code and its
license stay in the app. This removes unused development files from the
distribution rather than assigning them an unsupported license.

The shipped File Icons font matches
`Alhadis/FileIcons` commit `1733e5a1db30ae00d63a285676b0c51d12262033`.
Its SHA-256 is
`6f75c29f3206c61d1c3217f31693e8c071578a30f4c832a476ae951d51ec48ae`.
That commit's complete ISC notice has SHA-256
`1ab89e3af343bb0239ce4ca74802e335b33b0181569f753bddb7a7534e09396e`.
Production preparation retains the notice. `font-sources.json` maps that one
font to its source and license. It does not relabel the File Icons JS package
or clear the other four copied fonts or third-party icon designs.

MFixx matches commit `d0eac9f7ebc837e954dd98b784f5d2efd07f7e2f` of its
linked source project. DevOpicons matches commit
`23fffde69c4a0395bfb2c3ede95084e2c46e6abf` of its linked project. These byte
matches narrow provenance. Their complete modified-font terms remain open.

Codicons now has explicit attribution to Microsoft Corporation and its
contributors. The app preserves its complete unchanged README, including the
upstream trademark conditions. That README matches release tag `v0.0.45` at
commit `dbb6555160650624bb1719d6264910b1cbe528f2`. The source manifest has a
version placeholder, and the generated font is absent from that tree.
Do not treat the README match as complete font-build provenance. The font
bytes stay unchanged from the verified published package. Both complete
CC BY 4.0 and MIT license files stay in the app. Trademark review remains open.

The current inventory has 571 notice files and five unresolved package entries:
Once, East Asian Width, Font Awesome, Resolve Package Path, and Use Composed
Ref. Their checked source trees still lack complete matching terms. The font
and attribution improvements do not clear these package entries.

### Source evidence and build failure guard

The report now records on-disk source paths, sizes, and hashes for 5,699 input
records: 3,356 browser, 2,326 backend, and 17 Electron inputs. Fourteen generated
browser polyfills have no captured on-disk path and stay explicitly unverified.
Hashes are taken when the report is written after the bundle builds. They are
not snapshots of every loaded input or records of every transformation.
The sanitizer transformation remains separately recorded.

A real CSS font URL exposes a report error because its version suffix is not
part of the disk filename. The corrected record keeps the metadata URL and
the exact separate disk source path. A real esbuild regression verifies the
suffix behavior. Missing files and source links outside the repository fail.

The failed report also exposes unsupported npm 8 behavior: a failed workspace
build can return success to the package script. Packaging now rejects npm
versions below 11. Tests verify that an old npm stops before any build and
that a production-build failure stops before Electron Builder. Evidence errors
now appear in the build log. The supported-npm rebuild passes. The failed
earlier package is not counted as a successful release check.

The exact unpatched FFmpeg source archive is available at
<https://chromium.googlesource.com/chromium/third_party/ffmpeg/+archive/f45bab87ce4c5fafc67fd53fcde777578d01bfa0.tar.gz>.
The local archive has 18,247,011 bytes and SHA-256
`d89f18948ffd25e78fab4cd43b56818ee72a4e9d73f5ed447fc87b1c016aae5a`.
A read-only archive inspection checks 10,989 entries without extraction.
It finds the exact credits, complete LGPL 2.1 text, build file, and both reviewed
configuration headers. The Electron patch is not part of that upstream archive.
The applied patch set, complete build dependencies and instructions, and
applicable replacement or relinking materials still need a reviewed source
release. No source archive or binary is published by this check.

The official clean Linux x64 library has 4,389,568 bytes and SHA-256
`982b54151885b5ff9561451fe6235e0ffc869d84b2ff3e0ce362ef922eacf2e8`.
Its archive passes the pinned hash check. This is a byte and ELF-header check,
not native execution or a complete corresponding-source result.

### Startup and navigation

The later 66-test run has 62 passes, two failures, and two tests that do not run.
It is not a release pass. Changes settings reaches its test timeout after a
second window opens. Its first process exits with SIGABRT. A modal dialog blocks
the terminal attention Control+C test. These failures need separate diagnosis.
The earlier repeated measurements below do not clear these wider-run failures.

Ten repeated packaged settings tests pass with 40 app launches. First-window
times range from 655 to 10,233 milliseconds. One second launch has the slow
result. Its debugger connection completes at 594 milliseconds. The delay occurs
before the first window. Every preceding normal quit records process exit before
application close, so process overlap does not explain these measurements.
The original 30-second first-window timeout does not reproduce in this run.
Its cause stays open. No startup delay, retry, or longer timeout is added.

Ten traced navigation tests pass in 11.2–11.7 seconds. The earlier 72-second
result does not reproduce. The traces stay in the local review folder. These
results do not prove that the intermittent startup and navigation issues are
fixed. App behavior remains unchanged for these results.

### Agent hooks and native Omarchy

Installed versions stay at Claude Code 2.1.282, Codex 0.159.0, and Gemini 0.46.0.
Codex's generated offline schema accepts all seven configured hook event names.
It has no reliable turn-failure event. The current Gemini reference also has no
matching turn-failure event. Unsupported failures stay unmarked. Setup, login,
global configuration, permissions, and hook trust stay unchanged. Full live
lifecycle verification still needs a usable approved session.

The Linux setup check rejects this macOS host before dependency installation.
Shared Linux configuration and isolated Arch staging checks pass. They do not
verify Wayland, sandbox, keyring, PTY, keyboard shortcuts, launcher behavior,
`makepkg`, `namcap`, or pacman lifecycle. These checks still need an Omarchy
machine. Privileged installation also needs separate approval.

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
