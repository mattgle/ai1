# Remaining dependency findings

Review date: 2026-10-05. The current npm audit reports four low, 38 moderate,
and 12 high package findings. It reports no critical finding. The 54 entries
include packages affected through a dependency. They are not 54 separate app exploits.
This review does not clear the release gate.

The 2026-10-02 audit reports six low and 42 moderate findings, with no high or
critical finding. A fresh audit before the parser updates reports four low,
42 moderate, and 20 high findings. The advisory database changes without a
lockfile change. Do not use the older count as the current release result.

The reviewed lockfile SHA-256 is
`342a306b284db3a3abee540b42c0672d8cd3387b57adfec4dc1e8c9dba1b6305`.

## Runtime paths

| Package | Known path | Result |
| --- | --- | --- |
| `dompurify` | Theia core Markdown rendering and selection descriptions; Monaco package and embedded source | The app pins and overrides the package to 3.4.16. The browser build routes Monaco's embedded import to a separate 3.4.16 instance. The current audit no longer lists DOMPurify. The reviewed detached-handler regression and normal Markdown and editor hover checks pass. See the limits below. |
| `fast-uri` | Schema and URI dependencies | Shipped version updates from 3.1.7 to 3.1.8. The percent-encoded host normalization regression fails before the update and passes after it. The current audit no longer lists this package. |
| `ip-address` | SOCKS proxy code | Shipped version updates from 10.7.0 to 10.7.2. Cross-family subnet and bounded-diagnostic regressions fail before the update and pass after it. The current audit no longer lists this package. |
| `uuid` | Tooltip and trash dependencies; Theia core UUID utility | Shipped. Theia core calls v5 without a caller-provided buffer. That exact call pattern passes the development and packaged regression. The affected tooltip and trash copies and their callers still need review. A forced major override is not approved. |
| `@tootallnate/once` | The VS Code proxy-agent dependency graph | The reviewed installed 1.1.2 implementation has no AbortSignal option. The HTTP proxy caller waits for connect without a signal. Connection and error settlement tests verify listener cleanup. The advisory and unreviewed callers remain open. |
| `diff` | Mocha dependency graph | The audit flags the development copy in the 7.x range. The package inventory also contains a shipped 5.2.2 copy, outside this advisory's affected range. Bundled copies still need review. Do not classify all copies as test-only. |

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

The high entries trace to two direct advisories. The 2026-10-03 result has
20 high entries. The 2026-10-05 result has 12 with the same lockfile. The changed
count does not mean that eight app defects receive fixes.

- [`braces`, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  nested patterns can exhaust the stack. The installed 3.0.3 version is affected.
- [`http-cache-semantics`, GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp):
  max-stale handling can disclose cached responses across users. The installed
  4.2.0 version is affected.

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

The latest read-only audit still reports four low, 38 moderate, and 12 high
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

1. Save an audit result for the exact lockfile and shipped package.
2. Match each advisory range to each shipped copy and caller.
3. Reproduce applicable cases with isolated inputs.
4. Review compatible fixed versions. Do not run `npm audit fix --force`.
5. Test each explicit update before rebuilding the distribution.
6. Repeat the audit and packaged runtime checks before release approval.

Current checks establish archive-link rejection and fixes for the reviewed URI
and IP parser cases. They do not establish that the remaining findings are
unreachable or that native Omarchy is safe.
