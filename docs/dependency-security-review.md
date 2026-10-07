# Remaining dependency findings

Current review: 2026-10-07. After the approved MCP SDK 1.31.0 update, the read-only
npm audit reports four low, 47 moderate, and 12 high package findings. It reports
no critical finding. The 63 entries
include packages affected through a dependency. They are not 64 separate app exploits.
This review does not clear the release gate.

The 2026-10-06 audit after the compatible Proxy Addr update has 63 findings.
The first October 7 audit adds a high MCP SDK OAuth advisory and has 64 findings.
The approved SDK update removes that audit entry. It does not fix all Theia
credential paths or change the existing app package. Proxy Addr 2.0.8 stays installed.

The earlier 2026-10-05 audit reports four low, 38 moderate, and 12 high findings.
The first 2026-10-06 audit adds a critical Proxy Addr advisory and a moderate
Sprintf JS advisory. It reports 64 findings before the Proxy Addr update.

The 2026-10-02 audit reports six low and 42 moderate findings, with no high or
critical finding. A fresh audit before the parser updates reports four low,
42 moderate, and 20 high findings. The advisory database changes without a
lockfile change. Do not use the older count as the current release result.

The earlier reviewed lockfile SHA-256 is
`342a306b284db3a3abee540b42c0672d8cd3387b57adfec4dc1e8c9dba1b6305`.
The lockfile SHA-256 before the MCP SDK update is
`8ba12b3fd93f741b38188eff099509b032dca1b463ccda5e4ddcdd9759537f1c`.
The current lockfile SHA-256 is
`87c7cfba94e870ca6cb29d0b1b10caa28f3e482007c92a1486656f76816c0832`.

## Approved MCP credential guard: 2026-10-07

AI1 now replaces Theia's OAuth provider factory within each frontend connection.
The guard refuses issuerless stored clients and tokens. A static client requires
an explicit `oauth.authorizationServer` pin. An existing token still requires
its own issuer, even when a pin exists. Discovery does not assign an issuer to
an old credential.

The provider checks fresh and cached discovery against existing credentials and
the configured pin. It checks stored record types with the SDK schemas. It
refuses malformed records without deleting them. Cancellation clears the code
verifier and blocks login redirects. Existing transports can still read and
refresh issuer-bound tokens after Theia cancels the completed login callback.
Each flow takes a separate configuration snapshot.
The factory retains Theia's connection-specific frontend delegate, callback URL
cache, callback state, and credential scope.

The original provider returns legacy credentials to the SDK. Static clients
also lack an issuer in its return value. The SDK permits these values. The
original strict nine-case check reproduces three failures before the guard.
The expanded guarded caller check passes all 14 cases. It verifies no token
request and byte-identical stored records on refusal. Valid issuer-bound refresh,
pinned static code exchange, and cached same-server credentials still work.

The shell-layout suite passes 64 tests, including 51 new guard checks. These
checks cover malformed storage, issuer values, cached discovery, cancellation,
separate frontend connections, configuration snapshots, fresh dynamic
registration, code exchange, and token use after login-callback cleanup.
A real MCP server startup reaches
`Authentication Required` without SSE fallback or credential removal. The
network connection step uses the test provider; it opens no remote connection.
The factory checks use the real Theia backend and connection container modules.

All 822 workspace unit tests and 93 release-script checks pass. Repository
lint, workspace type checks, formatting, and whitespace checks pass. The local
production build passes. Its generated backend loads Theia's
MCP module before the guard module. Its build-input report includes the guard
provider, factory, and backend module. Two existing Agents `require.resolve`
warnings remain. These initial guard checks use no app launch or live login.
The packaged follow-up below records the later rebuild. No installed-app
replacement or binary publication occurs.

Strict dependency, sanitizer, and archive checks have 38 passes and three
failures. All three failures concern HTTP Cache Semantics. No MCP case is
pending or skipped. Other release gates remain open.

### Connection recovery and review boundary

The guard does not edit live configuration, add a pin, delete credentials, or
start a login migration. An affected connection stops. Theia reports
`Authentication Required`; its existing status handler replaces the guard's
specific message with the general authorization message.

Before recovery, verify the authorization server through a trusted source.
Static clients require an owner-approved explicit pin. Legacy records require
an owner-approved sign-out and new sign-in. A new sign-in alone does not bypass
the preserved unsafe record. No such recovery action occurs in these checks.
Theia's existing manager can delete credentials when a live pin changes. This
guard does not change that separate configuration-update behavior.

The `npm run test:dependency-security` command builds shell-layout before the
caller checks. Build shell-layout first if you run the test file directly in
a clean source checkout. The default dependency check uses the compiled AI1
guard. Set `AI1_MCP_UNGUARDED_REVIEW=1` only for an explicit upstream-provider
comparison. Set `AI1_REQUIRE_DEPENDENCY_FIXES=1` for the release gate. A passing
unguarded or non-strict review does not prove that the application is safe.

The shell-layout manifest and lockfile declare the already reviewed SDK 1.31.0
and Theia AI MCP 1.75.0 as direct dependencies. No package resolution changes
in this guard work. The offline lock update disables install scripts. The
seven-day release-age rule stays unchanged.

### Packaged guard follow-up: 2026-10-07

The local macOS arm64 test app now includes the guard. Its production build,
ad-hoc signature, and strict signature verification pass. All six
language-resource checks pass. All 14 strict MCP caller checks pass against
the packaged provider and SDK. All 16 package-evidence checks pass.

The new package-evidence regression checks the generated backend module order.
It verifies the copied provider, factory, and backend module against the
build-input hashes. All three modules contribute bytes to the backend bundle.
This is package and synthetic caller evidence, not a live OAuth login check.
The MCP checks use a memory store and synthetic discovery responses. They do
not read or change real credentials.

One isolated Agents startup check also passes with the packaged executable and
the normal forked backend. Its main process exits with code 0 and no signal.
This smoke check does not replace the full UI or live-authentication gates.

The package still has 571 notice files and five unresolved entries. Its clean
FFmpeg library still excludes H.264 and AAC. The installed app stays unchanged.
Cache security, complete license duties, native Omarchy checks, and other
release gates remain open. No binary is published.

## Proxy trust fix and new formatter finding: 2026-10-06

[`proxy-addr`, GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
affects the installed 2.0.7 copy. A short IPv4-mapped IPv6 trust prefix accepts
an unrelated IPv4 client. A synthetic request from `203.0.113.15` with a
forwarded address of `198.51.100.77` reproduces this result for
`::ffff:10.0.0.0/8` and `::/1`. Correct plain IPv4 and mapped `/104` settings
reject that client. Regressions through Proxy Addr and Express's real request
IP getters both fail before the update and pass after it. Trusted private
clients still support normal forwarding.

The compatible update changes only Proxy Addr from 2.0.7 to 2.0.8 and its
lockfile metadata. The fixed release dates from 2026-09-15 and satisfies the
release-age rule. Install scripts stay disabled for the update. Theia and
Electron pins stay unchanged. The rebuilt backend report records a positive
2.0.8 input contribution. Development and packaged caller regressions pass.
The lockfile archive passes SHA-512 verification. The shipped `index.js` has
7,340 bytes and SHA-256
`aa7efd29bbd61cbcc1bdafde9e674db28ead077864f33bfad3cdd19bb5a3778c`.
Its retained MIT license also matches the archive. This fixes the dependency
defect; it does not establish that AI1's current trust configuration exposes
the original attack.

[`sprintf-js`, GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
has no published fixed version. The installed 1.1.3 copy reaches `RangeError`
with precision 101 for floating-point, exponential, and precision formats.
A five-second child-process fixture reproduces all three cases without
unbounded allocation. Another fixture reaches the defect through Roarr's
actual logger factory when a caller supplies a format string and arguments.
A single string uses the logger's fixed `%s` path and remains usable.
The exact lockfile places this copy under the optional development logger
Roarr. Neither package appears in the current packaged inventory or as a
recorded bundle input. Other external and dynamically loaded code still needs
review. The finding stays open. No framework downgrade occurs.

The development security suite has 16 passes and three pending cache failures.
The packaged suite before the extra logger fixture has 12 passes and six
build-only skips. The cache update remains blocked by the seven-day release-age
rule. Braces still has no newer published release. Do not report the passing
reproduction fixtures as security fixes.

## Runtime paths

The sanitizer build report now preserves the exact relative-import replacement
module, its hash, the original embedded source hash, and the selected DOMPurify
file hash. Both source files match lockfile-verified npm archives. The original
source stays unchanged in the payload. Packaged output and sanitizer checks
pass after this recording change. This does not clear unused sanitizer copies,
extension rendering paths, other build transformations, or complete source duties.

| Package | Known path | Result |
| --- | --- | --- |
| `dompurify` | Theia core Markdown rendering and selection descriptions; Monaco package and embedded source | The app pins and overrides the package to 3.4.16. The browser build routes Monaco's embedded import to a separate 3.4.16 instance. The current audit no longer lists DOMPurify. The reviewed detached-handler regression and normal Markdown and editor hover checks pass. See the limits below. |
| `fast-uri` | Schema and URI dependencies | Shipped version updates from 3.1.7 to 3.1.8. The percent-encoded host normalization regression fails before the update and passes after it. The current audit no longer lists this package. |
| `ip-address` | SOCKS proxy code | Shipped version updates from 10.7.0 to 10.7.2. Cross-family subnet and bounded-diagnostic regressions fail before the update and pass after it. The current audit no longer lists this package. |
| `uuid` | Tooltip and trash dependencies; Theia core UUID utility | Shipped. Theia core calls v5 without a caller-provided buffer. That exact call pattern passes the development and packaged regression. The affected tooltip and trash copies and their callers still need review. A forced major override is not approved. |
| `@tootallnate/once` | The VS Code proxy-agent dependency graph | The reviewed installed 1.1.2 implementation has no AbortSignal option. The HTTP proxy caller waits for connect without a signal. Connection and error settlement tests verify listener cleanup. The advisory and unreviewed callers remain open. |
| `diff` | Mocha dependency graph | The audit flags the development copy in the 7.x range. The package inventory also contains a shipped 5.2.2 copy, outside this advisory's affected range. Bundled copies still need review. Do not classify all copies as test-only. |
| `@modelcontextprotocol/sdk` | Theia AI MCP HTTP transports and OAuth provider; copied package source | Installed 1.31.0 fixes the reviewed issuer-bound SDK defect. The existing app package still contains affected 1.30.0. Static and old issuerless credential paths remain unsafe with 1.31.0. No recorded bundle input contributes this package. This does not make the copied code unreachable. See the 2026-10-07 reviews below. |

Only two dependency versions change in the parser update. Theia and Electron
pins stay unchanged. Run `npm run test:dependency-security` to check the URI and
IP cases. Set `AI1_PACKAGED_RESOURCES` to the app payload to check packaged copies.

## DOMPurify update

Before the update, the graph has 3.4.15 and Monaco's pinned 3.2.7 package.
Monaco also embeds 3.2.7 in
`esm/vs/base/browser/dompurify/dompurify.js`. An npm override alone does not
replace that embedded runtime code.

The app now declares an exact 3.4.16 dependency. The root override removes the
separate 3.2.7 package. A checked-in esbuild configuration uses a narrow build
plugin for Monaco's embedded file. It imports the fixed factory and creates a
separate sanitizer instance. Monaco's hook cleanup does not remove core hooks.
The build does not modify third-party source files. Theia stays at 1.75.0 and
Monaco stays at 1.108.201.

The Electron regression reproduces descendant event-handler retention after
node-removing sanitization hooks before the fix. Both fixed instances strip
the handler after the fix. This tests the library defect. It does not prove
that the app's normal Markdown options expose that particular attack chain.
The app's core renderer, Monaco HTML and Markdown rendering, and a real
TypeScript documentation hover also pass compatibility checks.

Both generated app frontends contain the 3.4.16 sanitizer version assignment
and no 3.2.7 sanitizer assignment. A build regression checks that the route
replaces only Monaco's embedded file and leaves other files unchanged.
The original embedded source file remains in the packaged dependency directory.
It is not used by these generated frontends. Review unused dependency source
files and extension-provided sanitizers separately before distribution.

Run `markdown-security.spec.ts` against the local app or packaged app to repeat
the browser checks. These tests use the Electron harness with `--no-sandbox`.
They do not clear the native sandbox or the full security review.

## Remaining high findings

The earlier high entries trace to two direct advisories. The 2026-10-03 result has
20 high entries. The 2026-10-05 result has 12 with the same lockfile. The changed
count does not mean that eight app defects receive fixes.

- [`braces`, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  nested patterns can exhaust the stack. The installed 3.0.3 version is affected.
- [`http-cache-semantics`, GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp):
  max-stale handling can disclose cached responses across users. The installed
  4.2.0 version is affected.
- The 2026-10-07 audit adds
  [`@modelcontextprotocol/sdk`, GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h).
  Version 1.30.0 can send OAuth credentials to a server-selected authorization
  server. The fixed 1.31.0 release meets the release-age rule. Provider and old
  credential checks remain necessary. See the detailed review below.

The 2026-10-03 check has no published fixed version for either package.
The 2026-10-05 check finds `http-cache-semantics` 4.3.0, outside the reported
affected range. npm refuses the install because this version is inside the
configured release-age waiting period. The guard stays enabled. No dependency
or lockfile change occurs. The shared-cache regression remains a pending test
for installed 4.2.0. Recheck the update after the waiting period and run the test
before accepting the new version. `braces` still has no published fixed version.
The paths include Mocha, build file-copy tools, Electron download tools, and the
builder. Neither package has a package-level copy in the rebuilt macOS inventory.
That observation does not prove absence from generated bundles or safe build
behavior. Keep both findings open. Do not downgrade Theia or the builder to
satisfy npm's suggested changes.

The isolated review reproduces both defects. A 6,003-character nested brace
pattern throws `RangeError` in a child process with a 256 KB stack limit. A
shared cache policy with a fixture `Set-Cookie` response has zero freshness but
accepts a `max-stale=999999` request without revalidation. The cache test uses
synthetic values and no network request.

Got's installed default has no HTTP cache. The reviewed Electron downloader
passes its supplied options directly to Got. Its artifact file cache is not
the vulnerable shared HTTP cache. The generated app build uses fixed file-copy
patterns. These observations limit the reviewed exposure; they do not cover
all callers, optional downloader settings, or generated bundles. Both high
advisories remain open.

Theia packages account for many inherited findings from DOMPurify and other
shared dependencies. Do not downgrade Theia to satisfy npm's suggested fix.
Keep all Theia pins at 1.75.0.

Browser guest policies disable Node integration and enable context isolation,
web security, and sandbox preferences. Those policies do not prove that the
editor renderer is safe from HTML-sanitizer defects. Native sandbox tests
remain separate and open.

## Follow-up

### Build-tool caller checks: 2026-10-05

The exact lockfile has two direct Braces callers: Chokidar 3.6.0 and
Micromatch 4.0.8. Chokidar comes through Mocha and Esbuild Plugin Copy.
Micromatch comes through Fast Glob and Find Yarn Workspace Root. The copy
plugin invokes Globby, which uses Fast Glob. Its optional watch path also
invokes Chokidar with globbing enabled. The generated production copy rule
uses a fixed shell-integration glob, not a workspace-supplied pattern. That
limits this reviewed rule; it does not clear other build configurations.

Two bounded child-process regressions reproduce stack exhaustion through the
installed callers. Chokidar's internal watch-pattern helper throws `RangeError`
for a 6,003-character nested pattern with globbing enabled. With globbing
disabled, that helper accepts the same pattern. Fast Glob's public
`generateTasks` API throws `RangeError` with brace expansion enabled and
accepts it with expansion disabled. Each child uses a 256 KB stack limit,
a five-second process bound, and a synthetic pattern. Neither test starts
filesystem watching or a file scan. They confirm affected caller paths under
the fixture limits, not an app exploit or a security fix. The packaged tests
skip these development-only fixtures. The Braces advisory remains open.

Find Yarn Workspace Root reads workspace patterns from an ancestor manifest.
The reviewed Patch Package caller invokes it only in the Yarn branch when a
local Yarn lockfile is absent. This project builds with npm. That observation
does not establish the safety of optional Yarn builds or arbitrary manifests.

The only installed HTTP Cache Semantics chain is Got 11.8.6 through Cacheable
Request 7.0.4. Got defaults to no HTTP cache and selects Cacheable Request when
the caller supplies a cache. The two Electron downloader versions pass caller
options through to Got. Their artifact file cache is a separate mechanism.
A loopback fixture with no HTTP cache makes two origin requests and receives
two distinct synthetic responses. A fixture with a shared Map cache stalls
after its first origin request under Node 24.15.0. A bounded child process
stops it after eight seconds. It never reaches the `max-stale` request.
This hang does not establish cross-user disclosure or a fix. The policy-level
regression still reproduces the known defect. Complete caller validation for
an explicitly enabled HTTP cache remains open.

Further reduction separates that promise hang from the cache defect. Cacheable
Request completes a direct loopback response. Got's stream API also completes.
The cached promise response reports `aborted: true` and `complete: false`.
Got's promise handler returns early for the aborted flag. This explains the
observed unresolved promise branch, but the source of the flag and general
compatibility with other response types remain unverified. The downloader
uses Got's stream API rather than its promise API.

Two loopback fixtures now reproduce unsafe cache reuse through Cacheable
Request and Got's stream API. Each fixture uses an explicit shared Map cache,
a synthetic cookie response, and a max-stale second request. It waits for the
cache write before issuing the second request. Both fixtures receive the first
response body again and make only one origin request. Separate pending tests
require two origin requests and a fresh second body. They remain pending for
4.2.0 and skip in packaged runs where these build-tool dependencies are absent.
Each child has an eight-second bound. No external request, real cookie, or
user credential occurs. This confirms the affected optional cached caller
behavior; it does not establish that AI1 enables a shared HTTP cache in its
current build or runtime. The downloader's separate artifact cache remains
outside this defect. The high finding and release-age guard stay unchanged.

### Generated bundle evidence: 2026-10-05

The production build now records esbuild metadata in
`resources/release/build-inputs.json`. The report includes relative input
paths, nearest package names and versions, per-output input contributions,
external import names, and SHA-256 hashes of output files. Virtual native
input names also use relative paths. Tests check those path conversions.
All 20 reported outputs match the rebuilt macOS payload by hash.

The three builds have 3,370 browser inputs, 2,326 node inputs, and 17 Electron
inputs. A parsed input does not always contribute output bytes. The reviewed
dependency results below count only positive `bytesInOutput` contributions.

| Dependency | Generated output evidence |
| --- | --- |
| `braces` | No contributing inputs in the three recorded builds. |
| `http-cache-semantics` | No contributing inputs in the three recorded builds. |
| `diff` | 5.2.2 contributes to the main frontend. No contributing 7.x copy appears. |
| `uuid` | 7.0.3 contributes to both frontends. 8.3.2 contributes to the backend main output. |
| `@tootallnate/once` | 1.1.2 contributes to the plugin-host output. |
| `dompurify` | 3.4.16 contributes to both frontends. |

This evidence narrows the known generated-bundle scope. It does not cover
copied extension assets, external dependencies, dynamic imports outside
esbuild's graph, or all build-tool callers. Input identities also do not
prove that upstream bytes remain unchanged after build plugins. Monaco's
sanitizer import has an explicit transformation and separate regressions.
Keep the high findings and remaining runtime caller reviews open.

The 2026-10-05 read-only audit reports four low, 38 moderate, and 12 high
findings. The lockfile stays unchanged. The registry publication time for
`http-cache-semantics` 4.3.0 is 2026-10-04T02:56:05.593Z. The release-age guard
still blocks that candidate. No guard bypass or dependency update occurs.

The once advisory describes a promise that stays pending after AbortSignal
cancellation. The installed 1.1.2 implementation accepts an emitter and event
name, not signal options. The reviewed `http-proxy-agent` caller passes only
those arguments. The new regression checks successful connection and error
rejection, then verifies removal of both listeners. This does not reproduce
the signal-specific defect or clear every proxy path.

Theia's `hashValue` utility calls UUID v5 with a value and a fixed namespace.
It supplies no output buffer or offset. The new regression verifies a stable
version-5 UUID through the UUID package resolved from Theia core. The audit
also flags nested UUID copies under `react-tooltip` and `trash`. Do not use
the core caller test as evidence that those copies are safe.

The reviewed packaged `react-tooltip/dist/index.js` and `dist/index.es.js`
use UUID v4 without arguments. `trash/lib/linux.js` also calls `uuid.v4()`
without arguments. The reviewed call sites do not use the affected v3/v5/v6
buffer API. A regression resolves UUID from each dependency and checks its
version-4 result. This limits exposure at those call sites. It does not remove
the affected APIs from the shipped dependencies or establish every bundled
or extension caller. The audit finding stays open.

The VS Code proxy wrapper at `@vscode/proxy-agent/out/agent.js` has another
Once reference. The reviewed direct branch returns the original HTTP agent.
The HTTP proxy branch uses its installed HTTP Proxy Agent dependency. Two
additional regressions exercise those real caller paths. A direct-agent test
checks the returned object and proxy event. A loopback HTTP proxy test checks
a complete request and a refused connection after the fixture server closes.
The target uses `example.invalid`; the local proxy handles the request without
an external connection. Both tests pass in development and in the macOS
payload. The request timeout bounds only the synthetic network fixture.
These checks do not clear request cancellation, HTTPS or SOCKS behavior,
other extension callers, or the Once advisory. The cache regression still
fails under its pending marker for development 4.2.0 and skips in the payload.

### Fresh audit and release-age checks: 2026-10-07

The audit before the MCP SDK update has 64 entries: four low, 47 moderate, and 13 high. The
`--omit=dev` audit has 42 entries: three low, 38 moderate, and one high.
Neither audit has a critical finding. The production-only audit checks the
lockfile graph; it is not a complete audit of copied or bundled app bytes.
At that pre-update check, the lockfile SHA-256 is
`8ba12b3fd93f741b38188eff099509b032dca1b463ccda5e4ddcdd9759537f1c`.
The full audit JSON SHA-256 is
`d0500b9d378aa08cb407c17093341a2fe2e4d3a6187db32b1e2ec461770883a0`.
The production-only audit JSON SHA-256 is
`210189748f7fe926bb423fe284e8c8497da7f163e738b82f04f4e252c57ab19c`.
Both results are local evidence, not release approval.

The configured npm `min-release-age` remains seven days. Registry publication
times give these earliest eligible times in UTC:

| Candidate | Publication time | Earliest eligible time | Result on October 7 |
| --- | --- | --- | --- |
| HTTP Cache Semantics 4.3.0 | 2026-10-04T02:56:05.593Z | 2026-10-11T02:56:05.593Z | Not eligible. Keep installed 4.2.0 and its three pending regressions. |
| MCP SDK 1.31.0 | 2026-09-28T18:59:36.307Z | 2026-10-05T18:59:36.307Z | Eligible. The approved narrow update occurs after the archive review. |
| MCP SDK 1.32.0 | 2026-10-02T17:32:51.427Z | 2026-10-09T17:32:51.427Z | Not eligible. |
| MCP SDK 1.32.1 | 2026-10-05T11:47:50.208Z | 2026-10-12T11:47:50.208Z | Not eligible. |

The registry still has no Braces release after 3.0.3 or Sprintf JS release after
1.1.3. Do not downgrade, force an audit fix, or bypass the release-age guard.
Theia 1.75.0 and Electron 42.11.8 stay pinned. Proxy Addr 2.0.8 stays unchanged.

### MCP OAuth caller review: 2026-10-07

The new high advisory affects MCP SDK versions from 1.12.0 through 1.30.1.
Before the update, the exact lockfile has 1.30.0 through Theia AI MCP's `^1.30.0` range.
The local macOS app also contains 1.30.0 in its copied dependency directory.
The current three esbuild reports have no contributing SDK input.
AI1 does not declare Theia AI MCP as an app extension. The copied source and
external loading paths still require review. Absence from the bundle report
does not establish absence from the app.

The first two five-second child fixtures use Theia's real `MCPOAuthClientProvider` and
the installed SDK's `auth` function. The store is an in-memory Map. Every
fetch uses synthetic metadata or a synthetic token response. No network
request, keychain access, browser redirect, login change, or real credential
occurs. The fixtures run in development and against copied packaged modules.

With no configured authorization server, discovery selects
`https://changed.invalid/`. The SDK sends a synthetic client secret in HTTP
Basic authentication and a synthetic refresh token to its token endpoint.
The stored token includes `issuer: https://trusted.invalid/`, but installed
1.30.0 does not enforce it. The security expectation of no token request fails
under an explicit pending marker. With `authorizationServer` configured as
`https://trusted.invalid/`, the real provider rejects the changed discovery
state before the token request. This passing control limits the reviewed
configured path. It does not prove that every user configuration sets this field.

The advisory names 1.31.0 as the first fixed release. Its age and Theia's
dependency range permit a separate update review. That review must check
credentials saved before issuer support. The advisory states that old
credentials without an issuer can still go to the first selected server.
The reviewed Theia provider preserves extra fields on saved tokens and public
client information. Its static `clientId` and `clientSecret` branch returns
credentials without an issuer. A package update alone does not clear that
configuration or old stored credentials. Login, trust, and credential changes
need separate approval. Do not clear this finding from an audit count alone.

### Compatible MCP SDK 1.31.0 archive review: 2026-10-07

The advisory's exact affected range is `>=1.12.0 <1.31.0`. Version 1.31.0 is
the first fixed SDK release. The separate 2.x Client package and its 2.2.0
fix are not dependencies of this reviewed graph. This review does not propose
a package-family or major-version change.

The narrow candidate is exactly `@modelcontextprotocol/sdk@1.31.0` within
Theia AI MCP 1.75.0's declared `^1.30.0` range. Publication is
2026-09-28T18:59:36.307Z. Its seven-day wait ends on October 5. The configured
guard remains seven days. The parent approves the later narrow lockfile update.
No new root
dependency, forced override, Theia update, or Electron update is necessary
for this candidate.

The registry archive URL is
`https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.31.0.tgz`.
Its exact integrity is
`sha512-UvTMgnNlnIBO/22ob2RcVGDlcvOslQs8T59+FTGdA0L27a39fdGF/EDETNtDVK4DZGpwomlsYpRdA8UXcVL/pw==`.
The downloaded bytes pass that check and the registry SHA-1 check,
`86ce85651376ae54e5df2db29b18da0eef7054d4`. Archive SHA-256 is
`d2ff62b961316c4c4d7b03367ea8f70121839401adbd7a8aa4175f8e85c87af0`.
Extraction accepts only regular files and directories under `package/`.
It rejects links, absolute paths, and parent-path components. All 701 files
remain in the approved temporary directory. No install or lifecycle script
runs. These checks verify registry archive bytes, not the registry signature
or a complete provenance chain.

The 17 dependency ranges, peer dependency ranges, peer options, Node `>=18`
requirement, package exports, and type-path mappings match installed 1.30.0.
Each SDK-resolved installed dependency version satisfies the fixed range.
The tests reuse those exact installed root and nested dependencies through
temporary links. No transitive update is required by the fixed manifest.
A real npm resolution can still change the graph. Review the proposed diff
and preserve unrelated resolved versions.

The reviewed auth provider interface keeps its existing methods. Token and
client-information types add optional issuer fields. Resource parameters
expand from `URL` to `string | URL`. The SSE, Streamable HTTP, and stdio
transport declarations are unchanged. The shared resource-validation helper
also has identical bytes. The runtime exports used by Theia's server and
provider remain callable. A no-emit TypeScript comparison of Theia's provider
and server resolves the fixed declaration files. It reports no new diagnostic;
both SDK versions have the same eight injected-field initialization
diagnostics under the isolated strict check. This is a bounded compatibility
comparison, not a clean full-app typecheck or transport runtime proof.

The expanded fixture matrix uses the real Theia 1.75.0 provider with the
verified fixed SDK's `auth` function. Each child still has a five-second
bound and synthetic fetch responses. Its results are:

| Caller state | Installed 1.30.0 | Fixed archive 1.31.0 |
| --- | --- | --- |
| Configured trusted server; changed discovery server | Blocks the token request. | Blocks the token request. |
| Static client; token names the trusted issuer; changed server | Sends the secret and refresh token. | Sends neither. |
| Stored client and token name the trusted issuer; changed server | Sends the refresh token. | Sends no token request. |
| Old stored client and token have no issuer; changed server | Sends the refresh token. | Still sends the refresh token. |
| Static client; old token has no issuer; changed server | Sends the secret and refresh token. | Still sends both. |
| Static client has no issuer; synthetic code exchange at changed server | Sends the secret and code. | Still sends both. |
| Same trusted server; stored issuer-bound client and token | Refresh succeeds. | Refresh succeeds and preserves issuer fields. |
| Same trusted server; old stored client and token | Refresh succeeds. | Refresh succeeds and saves issuer fields on both records. |
| Same trusted server; static client and issuer-bound token | Refresh succeeds. | Refresh succeeds and saves the token issuer. |

The three same-server controls prevent rejection of every token request from
counting as a fix. The legacy and static failures are separate from the
issuer-bound defect fixed by 1.31.0. They remain explicit release blockers.
Do not treat the first server selected for issuerless credentials as trusted.
Do not infer issuer values from new discovery or clear real credentials in
this review. Those policy and migration decisions need separate approval.

The SDK-specific pending markers now apply only to the advisory's affected
range. The two issuer-bound expectations become required passing tests with
1.31.0. The three residual expectations remain pending by default, not fixed.
Set `AI1_REQUIRE_DEPENDENCY_FIXES=1` for the release gate. It removes all
security pending markers, including the cache markers. Against the fixed
archive, the complete nine-case MCP gate has six passes and three hard
failures, with no pending tests. The fixed-only bounded checks have six
required passes. Thus a successful default test command cannot clear the
remaining credential paths.
The six required checks also pass with the copied packaged Theia provider
and the fixed archive. This is not a rebuilt app or an Electron runtime check.

Set `AI1_MCP_SDK_REVIEW` to the unpacked `package` directory to repeat the
archive comparison without a repository dependency change. This setting
selects only the fixture's auth module and version check. Theia's provider
and its unchanged shared helper stay installed. No browser or keychain call
occurs. Recommend the exact 1.31.0 package update to remove the reviewed
issuer-bound SDK defect, but do not approve the release or claim that it
fixes static and old issuerless credential paths.

### Approved installed MCP SDK update: 2026-10-07

The approved update changes exactly three fields under
`node_modules/@modelcontextprotocol/sdk` in `package-lock.json`: version,
resolved archive URL, and integrity. The version is exactly 1.31.0. A parsed
comparison with the saved pre-update lockfile verifies that every other field
and package entry stays unchanged. No `package.json` edit, new root dependency,
override, Theia change, Electron change, or Proxy Addr change occurs.
The new lockfile SHA-256 is
`c3c82bc1c7595c51eda37b559609c3d4c4d8df1414e336b7ecd764833bdb894c`.

Cached npm 12.2.0 first runs
`npm update @modelcontextprotocol/sdk --package-lock-only --ignore-scripts --no-audit --no-fund`.
It selects only the eligible 1.31.0 release. The configured seven-day guard
stays active. npm's hidden install cache then reports 1.31.0 although the
installed package bytes still contain 1.30.0. That cache is preserved in the
approved temporary directory so npm can inspect the actual installed tree.
A normal `npm install --ignore-scripts --no-audit --no-fund --dry-run --json`
shows one SDK change and no additions or removals. The matching live install
also reports exactly one SDK change and no additions or removals. No lifecycle
script runs.

All 701 installed archive files match the verified 1.31.0 archive byte for
byte. The archive's SHA-512 integrity still matches the new lock entry. Both
the installed manifest and regenerated hidden install cache report 1.31.0.
Nested dependency versions stay unchanged. The temporary archive links and
comparison files stay outside the repository. The existing macOS payload
remains unchanged and still contains SDK 1.30.0. No build, Electron test, or
packaged-file edit occurs.

The installed strict MCP gate has six passes and three hard failures, with no
pending tests. Its failures are the legacy stored refresh-token path, the
static-secret plus legacy-token path, and the static authorization-code path
without an issuer. The two issuer-bound rejection cases now pass without a
pending marker. All three valid same-server refresh controls pass.

The full development dependency suite has 27 passes and six pending failures.
The strict suite including archive-security tests has 30 passes and six hard
failures, with no pending tests or skips. Three failures are the remaining MCP
paths. Three are HTTP Cache Semantics 4.2.0 policy and caller expectations.
The first fixed cache release remains ineligible before October 11. Do not
treat the default suite's success exit code as release approval.

The post-update full audit has 63 entries: four low, 47 moderate, 12 high,
and no critical finding. Its JSON SHA-256 is
`ab8f08f6950a6b24c078010cff78bcf3843de603b4d77d29cde9b99f69ff653c`.
The production-only lockfile audit has 41 entries: three low, 38 moderate,
and no high or critical finding. Its JSON SHA-256 is
`d8f4cdc6e13e53a73dcd281289733e3f2b273a3cea206c98adbda391422d7782`.
Neither audit lists the SDK package now. This does not clear the three real
Theia credential defects or the unchanged packaged SDK copy. The parent owns
the next integration review. Login, trust, and credential state stay unchanged.

### Remaining caller and external review: 2026-10-07

The reviewed Global Agent JavaScript calls use fixed log messages. Request
URLs, errors, and proxy settings occur in context objects, not caller-supplied
format strings. A five-second fixture enables Roarr logging and invokes the
real proxy controller. Each proxy setting contains `%.101f`. An observed real
formatter call uses `configuration changed` for all three settings. The
settings stay unchanged and no precision error occurs. The separate logger
fixture still reproduces the formatter defect through a format-string call.
This limits the reviewed downloader logger caller; it does not fix Sprintf JS.

The root Mocha reporter uses Diff 7.0.0. Its unified mode calls `createPatch`;
its inline mode calls `diffWordsWithSpace`. A five-second fixture wraps the
child's module exports to record those real calls and reject `parsePatch` or
`applyPatch` use. Both report modes produce the expected small diff without
those affected patch-input APIs. The copied and contributing app copy remains
5.2.2, outside this advisory's range. Other callers and arbitrary extensions
remain outside this check.

Two eight-second loopback fixtures extend the VS Code proxy-wrapper checks.
An HTTP proxy returns 403 to an HTTPS CONNECT request. The caller receives
that status without a TLS exchange or target connection. A SOCKS5 proxy
rejects authentication selection, and the wrapper reports connection failure.
Both fixtures pass in development and the package. They do not establish
successful TLS or SOCKS tunnels, cancellation safety, or the safety of every
proxy path. No TLS verification or trust setting changes.

All 20 recorded output hashes still match the existing local macOS payload.
Its build report SHA-256 is
`596c484bbca4312ad80fe411c4ae40651e3e2f7df5189ffc1dfd5591840c0859`.
A dependency-directory scan reads 651 package manifests. It finds MCP SDK
1.30.0, Once 1.1.2 and 2.0.1, Diff 5.2.2, and UUID 7.0.3, 8.3.2, and 11.1.1.
It finds no package-level Braces, HTTP Cache Semantics, Sprintf JS, or Roarr
copy in that directory. This scan does not identify embedded code without
package metadata.

After exclusion of Node built-ins and CSS asset references, the recorded
external code imports are `bufferutil`, `utf-8-validate`, `pnpapi`,
`./build/Debug/watcher.node`, two AI1 Agents helper entry points, `electron`,
and `@vscode/windows-ca-certs`. None names the seven directly flagged packages.
That fixed import list is not the full dynamic graph. Theia's `dynamicRequire`
also accepts absolute module paths. A regression loads the copied MCP auth
module through that real helper in both environments. It also verifies
relative-path rejection. This proves a bounded external loading path, not
actual activation of MCP OAuth in AI1.

Copied extension assets, arbitrary extension modules, computed imports,
successful proxy tunnels, remaining build configurations, and old credential
issuer handling remain open. Passing reproduction tests do not clear these
release blockers.

The expanded focused Node security suite has 25 passes and eight pending
failures with installed 1.30.0. The existing packaged suite has 19 passes,
nine development-only skips, and five pending MCP failures. With the fixed
archive selected, the development suite has 27 passes and six pending
failures: three cache expectations and three residual MCP expectations. Node
returns success for pending tests; that exit status does not clear the gate.
The strict MCP gate against 1.31.0 instead returns failure for the three
residual credential paths. Use strict mode for release approval.
No Electron runtime test or build occurs in this review.

1. Save an audit result for the exact lockfile and shipped package.
2. Match each advisory range to each shipped copy and caller.
3. Reproduce applicable cases with isolated inputs.
4. Review compatible fixed versions. Do not run `npm audit fix --force`.
5. Test each explicit update before rebuilding the distribution.
6. Repeat the audit and packaged runtime checks before release approval.

Current checks establish archive-link rejection and fixes for the reviewed URI
and IP parser cases. They do not establish that the remaining findings are
unreachable or that native Omarchy is safe.
