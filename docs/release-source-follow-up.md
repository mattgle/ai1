# Release source follow-up

Review date: 2026-10-07. This review does not approve binary distribution.
See [Public-release review](public-release-review.md) for the release gates.

## Result

- All five unresolved npm archives match the current lockfile SHA-512 values.
- The exact FFmpeg source archive passes the repeated byte checks.
- Electron's only listed FFmpeg patch applies to that source without a rejection.
- Both clean FFmpeg archives pass cryptographic publication provenance checks.
- The local macOS framework and official Linux runtime have separate FFmpeg library links.
- Complete source-release, modified-library operation, and license duties stay open.

The initial source review does not build the app or run Electron tests.
The parent integration result below records the later build.
No installed-app replacement, commit, push, or publication occurs.
Existing notice mappings and font attribution files stay unchanged.
The inventory result of 571 notice files and five unresolved entries is the
earlier packaged result. This review does not regenerate that inventory.

## Offline backend external-load inventory: 2026-10-07

The following command compares the current packaged and production build
reports without loading or executing the reviewed modules:

```sh
node scripts/review-backend-external-loads.mjs <packaged-app-resources> <production-app-folder>
```

Both reports match. All 13 recorded backend output hashes match packaged bytes.
The checker inventories 12 external-load occurrences across seven targets.
Both copied Agents helper files match pinned byte identities and the current
compiled workspace files. This verifies identity, not their dependency closure
or complete TypeScript compilation provenance. Nine offline fixtures pass.
One fixture confirms that the complete-loaded-input gate still rejects the
report. No production capture or generator behavior changes.

Five targets return `MODULE_NOT_FOUND` from their recorded output locations:
`bufferutil`, `utf-8-validate`, `pnpapi`, `./build/Debug/watcher.node`, and
`@vscode/windows-ca-certs`. They remain unresolved. Their absence does not
establish safety or prove that their caller branches are unreachable. The
watcher's nonliteral platform-package load remains outside this static inventory.
Complete loaded inputs, runtime branch checks, source duties, and license duties
stay open.

## Offline generator tooling review: 2026-10-07

The checker verifies the current macOS arm64 tooling candidates. It reads local
archives and the existing production report. It performs no network request,
extraction, generator execution, binary launch, or production build.

```sh
node scripts/review-generator-tooling.mjs <local-archive-folder> <build-input-report.json>
```

The real offline run verifies 59 selected files against 19 lockfile-verified
npm archives. It verifies 33 static module candidates and 43 parent-relative
resolution records, including the host esbuild binary. Both generator identities
match their production records: 14 polyfill captures and eight Theia captures.
Selected source maps, TypeScript source files, package manifests, and runtime
tooling modules match exact archive entries. Local file reads have a 16 MiB
limit. Archive decompression has a separate 64 MiB limit.

The reviewed `mlly` caller selects its nested `pkg-types` 1.3.1 and `confbox`
0.1.8. A root-level substitute fails. Changed generators, wrong capture counts,
changed manifests, missing or duplicate archive entries, changed bytes, links,
escaping paths, and unreviewed registries also fail. All ten focused checks
pass. The tooling and external-load fixtures now use the standard temporary
directory API, not a Mac-specific path. Their portable fixtures do not prove
native Omarchy execution. The full tooling check explicitly supports only the
reviewed macOS arm64 capture set.

This is a fixed candidate set, not a complete runtime-loaded dependency closure.
The checker keeps two optional `pnpapi` resolution paths unresolved. It does not
resolve nonliteral loads or establish the original tooling environment, selected
binary overrides, importer manifests, default-loader snapshots, or source
compilation. The Linux `detect-libc` candidate's bytes are checked without
executing its conditional branch. The sanitizer generator's current hash is
reported, but its identity is not recorded in the production report. That gap
remains open. Complete compilation, corresponding-source, and license gates
stay unchanged. No production capture or generator behavior changes.

The integrated macOS run passes all 133 release-script checks, with no skips
or pending markers. Lint, formatting, end-to-end types, whitespace, and both
redacted secret scans pass. The lockfile hash stays unchanged. The existing
local app also passes strict deep signature verification after the runtime
checks. No app rebuild, installed-app replacement, or binary publication occurs.

## Five unresolved package notices

Each registry archive passes the exact current lockfile SHA-512 check.
The registry `gitHead` identifies each checked source tree.
The source connection is registry metadata, not a signed compilation record.

| Package | Version | Source repository | Source revision |
| --- | --- | --- | --- |
| `@tootallnate/once` | 1.1.2 | `TooTallNate/once` | `3948afcb5803013e184861943e0018e37830fcfe` |
| `eastasianwidth` | 0.2.0 | `komagata/eastasianwidth` | `b89f04d44dc786885615e94cd6e2ba1ef7866fa4` |
| `font-awesome` | 4.7.0 | `FortAwesome/Font-Awesome` | `a8386aae19e200ddb0f6845b5feeee5eb7013687` |
| `resolve-package-path` | 4.0.3 | `stefanpenner/resolve-package-path` | `80178425b38d95d27d77886a3ba930473b0864d1` |
| `use-composed-ref` | 1.4.0 | `Andarist/use-composed-ref` | `ea2c9d969f2f90a349f4c99338b806423824cea2` |

Use `https://github.com/<repository>/tree/<revision>` for each immutable tree.

| Package | Archive bytes | Archive SHA-256 |
| --- | ---: | --- |
| `@tootallnate/once` | 1,693 | `d7e4f3485dd132af5d051c0c424d708a2ec2966f0432c994cad060182094ae2c` |
| `eastasianwidth` | 2,893 | `eccfa12bbda71f9f8e09de7ad1a4e554369a6b4d43d7f86085e85055a8694c27` |
| `font-awesome` | 671,527 | `92042b715919e17499ded134884b0318fd88041efac9b0f3204069df52222a61` |
| `resolve-package-path` | 15,315 | `1843a99115e62c83163331a4ee9ac1d698467c4571df0b8a075789636e00dd17` |
| `use-composed-ref` | 1,997 | `e96570f537b0911cfcfdacb026d5680df679edd4747602d027ad451412501cae` |

Once has no archive README or license file. The other four archives retain a
README, but it does not supply complete matching license terms. The four MIT
release trees have no license file. MIT metadata alone does not supply the
copyright notice or full terms.

Font Awesome's exact tree contains `src/license.html`. It links the font and
code terms through website settings. It does not contain their complete text.
The tree also contains `src/3.2.1/license/index.html`. That older version's
page is not an exact 4.7.0 notice. Do not assign its earlier copyright notice
to the 4.7.0 font or code.

At the October 7 checkpoint, proposed package supplement mappings are **none**. Keep all five entries
unresolved. Obtain an upstream notice that expressly covers the exact shipped
release, or select a separately approved dependency change. Do not borrow a
newer package's terms or use AI1's MIT license to fill these gaps.

### Public notice history and Once candidate: 2026-10-08

Unauthenticated public checks find current MIT notices for Once, East Asian
Width, and Resolve Package Path. All three notice paths return 404 at the
recorded release revisions. File history identifies these later additions:

| Package | Notice addition revision | File | Addition date | Manifest version at addition |
| --- | --- | --- | --- | --- |
| Once | `de4a704b54936d83c8d6347d28665fe3b66c6de6` | `LICENSE` | 2020-11-04 | 1.1.2 |
| East Asian Width | `1d41951a59d63fb2d77cda021050fc070cae424a` | `MIT-LICENSE.txt` | 2024-06-05 | 0.3.0 |
| Resolve Package Path | `92fd81dd39785bee876c3fa6970b6f4508527323` | `LICENSE` | 2022-12-02 | 4.0.3 |

The East Asian Width comparison includes changed JavaScript and a version
change from the shipped 0.2.0. The Resolve Package Path comparison includes
changed TypeScript and declarations despite its unchanged version. Neither
comparison establishes an exact unchanged release covered by the later notice.
Do not clear these gaps from the current repository license endpoint alone.

The current Font Awesome notice belongs to branch 7.x. It declares CC BY 4.0
for icons and a 2026 font copyright. It is not a matching notice for shipped
4.7.0. The Use Composed Ref license endpoint returns 404. That response does
not prove the absence of notices at every path or an absence of permission.

Once has a stronger candidate. The public comparison from release revision
`3948afcb5803013e184861943e0018e37830fcfe` to notice revision
`de4a704b54936d83c8d6347d28665fe3b66c6de6` contains four commits. Its complete
file list adds only README and LICENSE. Direct immutable raw-file reads confirm
these three files match byte-for-byte at both revisions:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `package.json` | 1,209 | `91391dee2904a0bb0de498cc0a41e020338d671a4c85f5bcafa15dde73eb26fe` |
| `src/index.ts` | 1,253 | `515a841a42afadf7a70669eb603353b08f2ee849cee2294b6c5346654a9ff9f7` |
| `tsconfig.json` | 354 | `53bf7c711830860ba79a4405a5bc3a2e02ecb52a8901ef3bd773fdd068feee28` |

The manifest still declares `@tootallnate/once` 1.1.2 with MIT metadata.
The complete later notice names the package author as copyright holder. Its
exact bytes are available at this immutable URL:

<https://raw.githubusercontent.com/TooTallNate/once/de4a704b54936d83c8d6347d28665fe3b66c6de6/LICENSE>

The notice has 1,071 bytes and SHA-256
`737a723fe0ef2b0e337e330b9f42f6b9f50d13d9b1087c2b2c6fc2486b68f8c2`.
This identifies a complete notice associated with unchanged 1.1.2 source, not
a newer package release's license selected solely by name.

The 1,693-byte npm archive again passes the current lockfile SHA-512 check.
Its SHA-256 matches the earlier table. All four installed archive files match:
the manifest, JavaScript, declaration, and source map. The packaged executable
`dist/index.js` also matches that archive. It has 1,096 bytes and SHA-256
`b9d3770080970a3e2923463bd5f5dc4e5f15493cc4d4d762eb60b7cd3eaeca14`.
The packaged manifest is not a byte match: `scripts`, `keywords`, and `bugs`
differ. Package name, version, and license match. The package omits the
declaration and source map. Record those transformations rather than claiming
that every installed file appears unchanged in the package.

This review proposes the pinned Once notice as a version-specific supplement
candidate. It does not add a mapping or replace any packaged notice. All five
entries therefore remain unresolved in the unchanged package. Original
compilation provenance remains separate from source and notice identity.
No app, native helper, package install, dependency resolution, authenticated
request, or GUI test occurs. The Once cancellation advisory remains open and
is not affected by a notice candidate.

### Font Awesome version-specific declaration follow-up: 2026-10-07

The [official version-4 license page](https://fontawesome.com/v4/license/)
identifies its version as 4.7.0. It declares SIL OFL 1.1 for files in `fonts/`,
MIT for CSS, LESS, and SCSS, and CC BY 3.0 for the other project files.
The exact source revision's root
[`_config.yml`](https://github.com/FortAwesome/Font-Awesome/blob/a8386aae19e200ddb0f6845b5feeee5eb7013687/_config.yml)
also identifies version 4.7.0 and those three licenses. The source configuration
is at the repository root, not `src/_config.yml`.

The same revision's
[`src/_includes/brand-license.html`](https://github.com/FortAwesome/Font-Awesome/blob/a8386aae19e200ddb0f6845b5feeee5eb7013687/src/_includes/brand-license.html)
states that brand icons are their owners' trademarks. It limits their use to
representation of the named company, product, brand, or service. This declaration
does not establish rights for every glyph or give a general trademark grant.

These exact declarations narrow the applicable scope. They still link to license
terms rather than supplying a complete release-specific notice for all three
groups. No supplement mapping changes. The mixed-license package, copied-font
terms, and brand rights remain open. Do not assign the font copyright string to
the package's code or documentation.

## Modified fonts

The pinned MFixx README identifies the font as an optimized MFizz derivative.
The pinned DevOpicons README identifies it as an optimized Devicons derivative.
Neither README supplies complete modified-font terms.

| Source | Revision | README SHA-256 |
| --- | --- | --- |
| `file-icons/MFixx` | `d0eac9f7ebc837e954dd98b784f5d2efd07f7e2f` | `23d6905c43cf46f9816b28a6b182170022195d454352c1452762f0a05f2a3301` |
| `file-icons/DevOpicons` | `23fffde69c4a0395bfb2c3ede95084e2c46e6abf` | `95b860cdb56e98db19947954530dda5721204b831e096d82447b912852f92d43` |

The checked `LICENSE` and `LICENSE.md` paths return 404 at these revisions.
These path checks do not establish the absence of all embedded notices.
The earlier byte matches remain provenance evidence only. Original-font terms
do not, by themselves, establish the terms for these modified fonts.
Octicons source-release identity, the copied Font Awesome font's terms, icon
design rights, and Codicons trademark review stay open. No new font mapping
is proposed. This review does not install a WOFF2 reader.

## FFmpeg source and patch evidence

The source chain uses these exact revisions:

1. Electron 42.11.8: `b50ff46306a0bc5b4849cb2384c217c8f4c790da`.
2. Chromium 148.0.7778.280: `bfe29217d60b6ee25ce4e4b2c0abcd6361ae6eb6`.
3. FFmpeg: `f45bab87ce4c5fafc67fd53fcde777578d01bfa0`.

The [Electron DEPS file](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/DEPS)
pins Chromium's release. The [exact Chromium DEPS file](https://chromium.googlesource.com/chromium/src/+/bfe29217d60b6ee25ce4e4b2c0abcd6361ae6eb6/DEPS)
pins FFmpeg. `source-review.json` records both decoded file hashes.

The [unpatched source archive](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+archive/f45bab87ce4c5fafc67fd53fcde777578d01bfa0.tar.gz)
has 18,247,011 bytes and SHA-256
`d89f18948ffd25e78fab4cd43b56818ee72a4e9d73f5ed447fc87b1c016aae5a`.
The repeated check reads 10,989 entries without filesystem extraction.
It verifies the build file, complete LGPL 2.1 text, credits, source metadata,
and both reviewed clean configuration headers.
All six reviewed files also match direct requests to the immutable upstream revision.

New retained files are in
`applications/electron/resources/third-party/ffmpeg-source/`:

| Local file | Exact upstream input | SHA-256 |
| --- | --- | --- |
| `patch-series.txt` | `patches/ffmpeg/.patches` | `eb2ff86699f3aa0f6ac1b484a8c8a117a3149465273699e136e132024e38e7c6` |
| `link_with_loader_path.patch` | `patches/ffmpeg/link_with_loader_path.patch` | `acdd60ed59e0be46b6e0a018c14623a6122ed861262912a30798d79e6e6e2bcf` |
| `clean-ffmpeg.gn` | `build/args/ffmpeg.gn` | `17335efaaf176bdbc1e329206ff610591b7fab0082b6ff267d567416d7611327` |

All three files preserve the complete upstream bytes at the Electron revision
above. `source-review.json` records the sizes and the other build references.
These files are evidence inputs, not a standalone build tree or a source offer.
The retained upstream patch keeps its original author notice unchanged.

`git apply --check` and `git apply` both pass against an isolated `BUILD.gn`.
The result changes only `@rpath/libffmpeg.dylib` to
`@loader_path/libffmpeg.dylib` in the macOS install-name flag. The patched file
has 15,027 bytes and SHA-256
`a4a8becf7c3013e11a0b1a941ddaae27774250701a39bd6fd9968647602d7db3`.
No complete source tree is extracted or built for this test.

The following read-only command checks the local archive and retained files.
It also checks the same single-line result in memory against the patched hash.
It does not run `git apply` or treat the result as binary build evidence.

```sh
node scripts/review-ffmpeg-source.mjs <local-ffmpeg-source.tar.gz>
```

## Verified publication provenance

GitHub CLI 2.86.0 verifies the two cached clean archives with their Sigstore
bundles. Both checks enforce the exact source commit, source tag, signer
commit, certificate identity, and OIDC issuer.

| Archive | SHA-256 | Verified publication run |
| --- | --- | --- |
| `ffmpeg-v42.11.8-darwin-arm64.zip` | `ac0ee66fa9416ff93b06124a2ea89868b393d1388276ce963a9706889c142a21` | [35817086231](https://github.com/electron/electron/actions/runs/35817086231/attempts/1) |
| `ffmpeg-v42.11.8-linux-x64.zip` | `c6585e86f3980291c1b598a47c338439ea400bce5f5198149f9706962caa4b7b` | [35817086252](https://github.com/electron/electron/actions/runs/35817086252/attempts/1) |

The certificate identifies
`pipeline-segment-electron-publish.yml@refs/tags/v42.11.8`.
The issuer is `https://token.actions.githubusercontent.com`.
The macOS publication runner is GitHub-hosted. The Linux publication runner
is self-hosted. Neither result is native Linux execution evidence.

The Linux digest also has an attestation for 42.11.7. Select the 42.11.8 bundle.
Hash agreement alone does not select the correct release identity.
The workflow publishes existing build artifacts. Its verified identity does
not certify every compilation input or a reproducible FFmpeg build.

To repeat the check, get the public API result for the archive's digest at
`https://api.github.com/repos/electron/electron/attestations/sha256:<archive-sha256>`.
Save the matching 42.11.8 `attestations[].bundle` object as a JSON file.
Do not save the API's temporary signed `bundle_url` as a permanent source URL.
The following command verifies the archive against that saved bundle.

```sh
gh attestation verify <clean-archive.zip> \
  --repo electron/electron \
  --bundle <matching-42.11.8-bundle.json> \
  --source-digest b50ff46306a0bc5b4849cb2384c217c8f4c790da \
  --source-ref refs/tags/v42.11.8 \
  --signer-digest b50ff46306a0bc5b4849cb2384c217c8f4c790da \
  --cert-identity https://github.com/electron/electron/.github/workflows/pipeline-segment-electron-publish.yml@refs/tags/v42.11.8 \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --format json
```

## Build instruction boundary

The pinned [release build action](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/.github/actions/build-electron/action.yml)
selects `--import ffmpeg` and builds `electron:electron_ffmpeg_zip`.
The retained GN settings select Chromium branding, disable proprietary codecs,
and enable a separate component FFmpeg library.
`patches/config.json` maps the FFmpeg patch folder to `src/third_party/ffmpeg`.
Electron's dependency hooks apply the patch set during checkout setup.
Do not apply the retained patch again to an already patched checkout.

Use the exact upstream [GN instructions](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/docs/development/build-instructions-gn.md),
[macOS instructions](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/docs/development/build-instructions-macos.md),
and [Linux instructions](https://github.com/electron/electron/blob/b50ff46306a0bc5b4849cb2384c217c8f4c790da/docs/development/build-instructions-linux.md).
Their verified hashes are in `source-review.json`.
The macOS document lists macOS 12 or later, Python 3.9 or later, Node 22.18.0
or later, and Xcode. It does not pin an exact Xcode release.
The Linux document links changing prerequisite pages. Those links are not
an immutable build-dependency record.

The following is a candidate build procedure, not a tested result.
It needs a separately approved new Electron checkout and pinned build tools.
It must not run in the AI1 checkout or an installed app.

1. Configure a fresh gclient solution for `src/electron`.
2. Sync Electron at `b50ff46306a0bc5b4849cb2384c217c8f4c790da` with its DEPS.
3. Keep all declared dependency revisions and applied patches.
4. Check the FFmpeg revision, configuration headers, and patched build hash.
5. Record compiler, SDK, sysroot, GN, Ninja or Siso, and all tool versions.
6. Use the clean GN import and target CPU for the intended native host.
7. Build the declared FFmpeg ZIP target and record its complete command log.

After these prerequisites, the following commands generate the clean arm64
configuration and build the upstream ZIP target. For native Linux x64, change
`target_cpu` to `"x64"`. These commands do not run in this review.

```sh
gn gen out/ffmpeg --args='import("//electron/build/args/ffmpeg.gn") target_cpu="arm64"'
autoninja -C out/ffmpeg electron:electron_ffmpeg_zip
```

The source ZIP requires the surrounding Chromium build tree. The standalone
FFmpeg archive cannot supply that tree. Before release, review the actual
dependency and tool records and test this procedure on both native targets.
Do not advertise these candidate commands as a verified complete source build.

## Replacement and relinking boundary

A read-only Mach-O check of the existing local macOS bundle finds:

- The Electron framework links to `@rpath/libffmpeg.dylib`.
- Its `LC_RPATH` includes `@loader_path/Libraries`.
- The library's install name is `@loader_path/libffmpeg.dylib`.
- The library resides at
  `Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib`.
- The app has an ad-hoc signature, no team identifier, and no listed entitlements.

This establishes a separate-library path, not operation with modified code.
No replacement or signature change occurs. It does not establish the signing
or library-validation policy of a future public build.

A static ELF check also verifies the official Linux runtime archive hash
`2bb665f0884f4ce6b7eb4fa7e23435616458e61c6548c9bfcc69816126684e83`.
Its `electron` file has 220,122,328 bytes and SHA-256
`9ce81865c4d67453cfc35fa4e9b5e900fa1d9eb9a995958dbd6f8ee9ab0a4feb`.
It has a `DT_NEEDED` entry for `libffmpeg.so` and `DT_RPATH` of `$ORIGIN`.
The clean library has a `DT_SONAME` of `libffmpeg.so` and `DT_RUNPATH`
of `$ORIGIN`. Its 4,389,568 bytes retain SHA-256
`982b54151885b5ff9561451fe6235e0ffc869d84b2ff3e0ce362ef922eacf2e8`.
This supports a library path beside the runtime executable. It does not verify
an AI1 Linux package, native loader behavior, or operation with a modified library.

LGPL 2.1 section 6 includes conditions for a suitable shared-library mechanism.
The complete checked text includes operation with an interface-compatible
modified library. A legal review must select the applicable distribution path.
This review does not select one or make a three-year source offer.

Remaining work includes:

1. Supply the exact library source and applied changes through a reviewed source release.
2. Include required build inputs and complete tested build instructions.
3. Verify operation with an interface-compatible modified FFmpeg library in an approved app copy.
4. Review the actual release signing policy and a usable replacement procedure.
5. Supply any required object files or other relinking materials for the selected license path.
6. Review notices, modification rights, and reverse-engineering conditions.
7. Complete native Linux runtime and replacement checks.

Theia EPL source duties, native MessagePack source duties, extension inputs,
other transformed inputs, and generated polyfills remain separate checks.
The FFmpeg results do not clear those gates.

## Focused validation

The following command runs offline fixtures for the source checker.
The fixtures cover exact bytes, wrong hashes and sizes, absent entries,
duplicate entries, symbolic links, ambiguous patch input, and an invalid archive.
The retained upstream patch and GN hashes also pass.

```sh
node --test scripts/review-ffmpeg-source.spec.mjs
```

The exact local source archive check and both strict attestation checks pass.
All six offline tests, repository lint, and focused formatting checks pass.
No production build or Electron test is part of this validation.

## Generated build inputs and load capture

The additional read-only review uses the existing esbuild report and generated
build setup. It does not change the report, generated configuration, or bundles.
The installed versions are `esbuild` 0.28.2,
`esbuild-plugins-node-modules-polyfill` 1.8.3, `@jspm/core` 2.1.0,
and `@theia/bundle-plugin` 1.75.0.

### Browser polyfills

The 14 virtual browser inputs comprise:

- Seven ESM entries: `buffer`, `node:buffer`, `string_decoder`, `path`, `os`,
  `net`, and `child_process`.
- Six CommonJS entries for those names except `node:buffer`.
- One empty `stream` entry.

The installed polyfill plugin bundles JSPM entry points in a nested esbuild call.
It then replaces `eval(` with `(0,eval)(` in that generated content.
The nested call uses `write: false`. It does not emit its own input metadata.
The outer metadata records only the generated result's byte count.
CommonJS entries use `export * from '<importPath>'`.
The empty entry uses `module.exports = {}`.
Knowing these templates does not establish their exact bytes in the earlier build.

The generator implementation is
`node_modules/esbuild-plugins-node-modules-polyfill/dist/index.js`.
Its 10,262 bytes have SHA-256
`187f1f1197b169856d7e730a3101487bf01eecbc66fcd191d73699fca5cb4149`.

The installed JSPM export conditions select browser entry points in
`node_modules/@jspm/core/nodelibs/browser/`.
A static import review identifies the following candidate source files.
This table records current installed bytes, not historical nested-build inputs
or a verified published archive comparison.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `buffer.js` | 358 | `76a5a9b45cc1631dc762fd09e36235f34b698a5a641d7e9414509066010efca4` |
| `chunk-DtuTasat.js` | 67,411 | `8a9aadcf40bba9b15e01cd3199aebea3bdd6999334c0a87a5ba6944c06353a20` |
| `string_decoder.js` | 102 | `dbaa3997dd76d23288ec16b1bf46988c70bf8a03970b71eaab54bcac08e1e504` |
| `chunk-CcCWfKp1.js` | 11,115 | `0826ec8cb9edb00e11f1aec77c3ca71f43480ddb4866d32cdfd12228b737102f` |
| `path.js` | 720 | `988efb769a73b1ab94f665fc608f01149ba0446d4f631e59f051d3123e6c8bad` |
| `chunk-BlJi4mNy.js` | 15,603 | `545dc5387bf0b614b4c01fff421b3267bfc7087ed6eaac43022b60f317559317` |
| `chunk-DEMDiNwt.js` | 6,232 | `4a93fae2ed9a79d27cfbd893c0fd42313232ee101cf75d2089b90a2a764d5e17` |
| `os.js` | 3,060 | `8990b37ac3d4952ee76073b873763d6eb5374bdbdbc75d56388f76a8df68290c` |
| `process.js` | 7,163 | `cff25d8baee88ccee58931beab49226fa4898c5655bfd5d7b3dc3a3789b5ae53` |
| `net.js` | 886 | `b6d0870404cbfde1b075d3c4ba1ac32c71f1230af63d848784f39aa45a5ea253` |
| `child_process.js` | 682 | `5b19218ec05e36e9cd47e92e10f5f6deae3e05ef63e8b835c61aab37492e5e9b` |

`buffer.js` imports `chunk-DtuTasat.js`. `string_decoder.js` also imports
`chunk-CcCWfKp1.js`. `path.js` imports `chunk-BlJi4mNy.js` and
`chunk-DEMDiNwt.js`. `os.js` imports `process.js`.
These links narrow the source candidates. They do not replace nested input capture.

### Independent polyfill reconstruction: 2026-10-07

The local follow-up reconstructs the nested builds with esbuild 0.28.2 and
JSPM 2.1.0. It uses the plugin's browser export conditions, ESM bundle options,
and exact `eval(` replacement. It sets the working directory explicitly to
`applications/electron`. Generated source comments depend on that directory.
The initial root-directory comparison does not match the production hashes.
The explicit production-directory comparison matches every reviewed entry.

An in-memory loader snapshots the complete JavaScript source bytes and hashes
for each nested input. Each build with that loader produces the same bytes as
a separate build with the default loader. Input sizes match the nested metafile.
The on-disk source hashes still match the snapshots after each build.

| Browser entry | Nested source inputs | Matching production entries | External imports |
| --- | ---: | ---: | ---: |
| `buffer` | 2 | 2, including `node:buffer` | 0 |
| `string_decoder` | 3 | 1 | 0 |
| `path` | 3 | 1 | 0 |
| `os` | 2 | 1 | 0 |
| `net` | 1 | 1 | 0 |
| `child_process` | 1 | 1 | 0 |

All six CommonJS templates and the empty `stream` template also match their
captured production hashes and sizes. In total, all 14 outer entries match.
The production and signed local package build-input reports match byte-for-byte.
The temporary `ai1-polyfill-review-21pRmy/review.json` retains the input hashes,
generated hashes, versions, matching paths, and external-import records.
The check writes no app files and runs no Electron process or package install.

These results identify an exact source reconstruction for the current generated
bytes. They do not capture nested inputs during the original production build.
They do not verify complete generator dependencies, default loaders in the full
app build, or complete license and source duties.
The production generator and app behavior stay unchanged.

The subsequent published-archive check verifies JSPM 2.1.0 against the current
lockfile SHA-512 integrity value. All 11 distinct nested source files match the
archive entries byte-for-byte. The archive has 1,521,183 bytes and SHA-256
`03f58f124bc351a4d965291ab4d961794508b612ec116ad215700a28e3b43b44`.
The check reads selected entries through `tar -xOf` without filesystem extraction.
It records the archive identity and comparison count in the same temporary report.
This narrows the source-provenance gap. It does not clear the remaining duties.

The repeatable checker is `scripts/review-polyfill-source.mjs`. It uses a local
JSPM archive and writes JSON to standard output. It performs no network request,
filesystem extraction, package install, or app launch. The optional second
argument checks the packaged build-input report against the production report.

```sh
node scripts/review-polyfill-source.mjs <local-jspm-archive.tgz> <packaged-app-resources>
```

The checker requires the exact reviewed generator hash and all 14 reviewed
production entries. Missing, duplicate, unknown, or changed-generator entries
fail. Source snapshots must produce the same nested output as default loaders.
All recorded source sizes and hashes must match. External nested imports fail.
The archive must pass the current lockfile integrity check before decompression.
Missing, duplicate, linked, or changed selected archive files fail.

All six focused fixture tests and all 99 release-script checks pass. The
repeatable checker also passes against the current local archive and signed
package. These results do not enable the full loaded-input release gate or
clear the source and license duties listed above.

### Copied helper modes: 2026-10-07

The read-only helper check finds exact installed-to-production-to-package byte
matches for Ripgrep, macOS Trash, the PTY spawn helper, and the PTY module.
The production and earlier signed package copies all have mode `0777`.
The installed executables have mode `0755`; the installed PTY module has `0644`.
The pinned Theia copy function explicitly sets `0777`. Packaging preserves it.
The unchanged Arch staging guard rejects these group- and world-writable modes.

Two failing macOS and Linux mode fixtures reproduce the defect before the fix.
The packaging hook now calls `scripts/prepare-native-helpers.mjs` before signing.
It validates all known helper files before any mode change. It rejects linked
files, non-files, escaping paths, missing files, and unsupported targets.
It checks file identity through an open descriptor before changing its mode.
Executables use `0755`. The PTY module uses `0644`. Hash checks preserve the bytes.
Unrelated files, installed dependencies, and the installed app stay unchanged.

The helper report is `resources/release/native-helpers.json` in the app payload.
It records relative file paths, byte counts, SHA-256, and original and packaged
modes. All seven helper and branding fixtures pass. A Linux fixture reaches the real Arch
staging guard: unsafe copies fail before output creation, and normalized copies
pass. The staged archive retains the expected executable and module modes.
This fixture does not build or run a native Linux package.

The rebuilt local macOS package passes production compilation, ad-hoc signing,
strict signature verification, six language-resource checks, and all 17 package
evidence checks. The copied helper files retain their report hashes and safe
modes after signing. The two existing Agents build warnings remain.
Complete native-helper source and license duties stay open.

One isolated packaged persistent-terminal check also passes. It starts the PTY
and creates its fixture tmux session with the new modes. This is not a live
agent-hook or native Omarchy check.

The published-archive follow-up verifies lockfile SHA-512 integrity for
`@vscode/ripgrep-darwin-arm64` 1.18.0, `trash` 7.2.0, and `node-pty` 1.2.0-beta.12.
All four selected helper files match their published archive entries exactly.
The check reads archive entries in memory without filesystem extraction.
The temporary `ai1-native-source-review-P9GpwY/review.json` retains archive
identities, integrity values, and installed and published helper hashes.
This is byte provenance, not complete compilation inputs or source-duty clearance.

The offline checker is now `scripts/review-native-helper-source.mjs`. Supply the
packaged app's resource folder and a folder of local npm archives. Use each
archive's original registry filename. The checker performs no network request,
filesystem extraction, package install, helper execution, or permission change.

```sh
node scripts/review-native-helper-source.mjs <packaged-app-resources> <local-archive-folder>
```

It requires every reviewed helper for the named target. The payload file size,
SHA-256, and mode must match the packaging manifest. The copied dependency's
name and version must match the lockfile. Each archive must pass SHA-512
integrity before decompression. Required archive entries must be regular files
with the exact helper bytes. Missing, duplicate, linked, or changed entries fail.
Unreviewed targets, registries, escaping paths, and changed package versions fail.

The command passes against all four helpers in the current signed macOS package.
All seven offline helper-review fixtures and all 114 release-script checks pass.
The Linux fixtures do not establish native Linux execution. The report keeps
complete compilation inputs, source duties, and license duties explicitly open.

The full packaged-payload mode scan then finds two group-writable branding
copies: `resources/branding/logo-dark.png` and `logo-light.png`, both `0664`.
The hook now restricts only these copies to `0644` and retains their hashes in
`resources/release/branding-modes.json`. Source assets stay unchanged.
All 107 release-script checks, lint, and the e2e type check pass. The final
repack passes signing and the helper and logo hash and mode checks. A full
payload scan checks 16,752 files and 3,082 directories. It finds no unsafe modes
and no symbolic links. A packaged regression now repeats this full mode scan.
All 18 final package-evidence checks pass, including that regression. Final
lint, formatting, whitespace, e2e types, and redacted secret scans pass.

### Native compilation-input follow-up: 2026-10-07

The three lockfile-verified helper archives contain 49 Node PTY entries,
11 Trash entries, and four platform Ripgrep entries. The archive inventory
uses in-memory reads, not extraction or install scripts. The exact Node PTY
and platform Ripgrep registry records have no `gitHead`. This absence does not
identify the original compilation revision. Trash's registry record identifies
`74bed3edf34826595cf4a990b01b2b9b10733238`, but its `lib/macos.js` points to a
separate `sindresorhus/macos-trash` repository without a pinned helper revision.

These Node PTY build candidates match their installed archive bytes:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/unix/pty.cc` | 23,075 | `19210adfdaba3cd09809b56bb3281b14e74a8e5efc1f35d467d3c423c30856db` |
| `src/unix/spawn-helper.cc` | 494 | `22195de1710b574d5904fc89be5624c25e531de20d5e17e5998a2fd19d86e0e6` |
| `binding.gyp` | 4,657 | `60087f9bc86f372a5ad49d15d7854140c29fac959aaa1fb2c8ffd0dc021595dd` |
| `scripts/prebuild.js` | 1,172 | `7e604b10f7769d7dc95947d3481c00513b9e3bb6c561d5264506350a16a0381a` |
| `scripts/post-install.js` | 2,401 | `98b3f6379debdab20eea21f216e0d09fa38c7757ddc3411f1a743eae7f5be14a` |

The GYP specification names the two Unix C++ inputs and Node Addon API.
The install script selects prebuilds or runs Node GYP. Its build-from-source
option removes prebuilds. The post-install script cleans build files.
Neither script runs in this review. The current resolved Node Addon API is
7.1.1; that local resolution does not establish the publisher's exact inputs.
The current app omits Node PTY's `src/unix` directory. Archive source presence
therefore does not establish complete distributed source or a tested build.

The packaged Ripgrep executable's `--version` output identifies Ripgrep 15.0.0,
revision prefix `3a612f88b8`, PCRE2 10.45, and JIT availability. It searches
no file. Mach-O inspection lists only `libiconv.2.dylib` and `libSystem.B.dylib`,
not a separately named PCRE2 dynamic library. These observations identify
runtime declarations and load commands, not every original compilation input.

The official Ripgrep 15.0.0 tag resolves to
`3a612f88b805e14aef45bfa43e25a54abc6297fc`. The prebuilt project's `v15.0.0`
tag resolves to `5c302c331f59f578fd90e024a8f374012c40e8b4`. Its `config.json`
selects Ripgrep 15.0.0 and a retained upstream patch. Its build specification
selects the PCRE2 feature and static PCRE2 for the macOS target. The archive
packaging script includes only `rg`. These source declarations are candidates,
not a verified connection from this workflow to the copied npm binary.

The official release's macOS arm64 archive has 1,851,052 bytes and SHA-256
`16ded8d87db15333e8c06188ea2635dcde7f9869412f843e463a290f9d7493f3`.
It matches the release API's asset digest. The archive's `rg`, the npm archive's
`bin/rg`, and the packaged helper have identical bytes and SHA-256
`6ef40346bf31fcce79d9614c7745c198542925a0c7d4911e1ffe794c53392ac1`.
This establishes publication byte identity, not a verified original build.
The linked Azure build-log endpoint requires sign-in. No authenticated request
occurs. No original build log is verified. The release is not marked immutable;
the retained digest identifies the exact reviewed archive bytes.

The Ripgrep source lockfile names `pcre2-sys` 0.2.10 with checksum
`18b9073c1a2549bd409bf4a32c94d903bb1a09bf845bc306ae148897fa0760a4`.
The downloaded crate passes that SHA-256 check. Its bundled `pcre2.h` declares
PCRE2 **10.46**, not the executable's reported **10.45**. Its build script can
select a system library or bundled source. Do not substitute this crate for
the original matching PCRE2 source. Original build records, resolved crates,
toolchain, SDK, patches, and matching native inputs remain unverified.

The existing Chromium notice contains PCRE release-8 terms. It does not
establish matching PCRE2 10.45 notice coverage. The official PCRE2 10.45 tag
resolves to `2dce7761b1831fd3f82a9c2bd5476259d945da4d`. Its `LICENCE.md`
declares `BSD-3-Clause WITH PCRE2-exception`, including a binary-package
exemption. The review does not decide that exemption's application, substitute
older PCRE terms, or apply the Rust wrapper's terms to PCRE2. Complete native
notice coverage remains a separate review item. No notice mapping changes.

Authoritative source candidates:

- [Ripgrep source lockfile](https://github.com/BurntSushi/ripgrep/blob/3a612f88b805e14aef45bfa43e25a54abc6297fc/Cargo.lock)
- [Prebuilt configuration](https://github.com/microsoft/ripgrep-prebuilt/blob/5c302c331f59f578fd90e024a8f374012c40e8b4/config.json)
- [Prebuilt build specification](https://github.com/microsoft/ripgrep-prebuilt/blob/5c302c331f59f578fd90e024a8f374012c40e8b4/build/build.sh)
- [Prebuilt patch](https://github.com/microsoft/ripgrep-prebuilt/blob/5c302c331f59f578fd90e024a8f374012c40e8b4/patches/0001-resolve-binskim-issues.patch)
- [Official prebuilt release](https://github.com/microsoft/ripgrep-prebuilt/releases/tag/v15.0.0)
- [PCRE2 10.45 terms](https://github.com/PCRE2Project/pcre2/blob/2dce7761b1831fd3f82a9c2bd5476259d945da4d/LICENCE.md)

### Backend transformations

The existing backend report has four native `node-file` wrappers. Their disk
hashes identify the referenced native binaries, not the generated JavaScript.
The plugin also changes these four disk modules without an existing capture:

| Input | Metadata bytes | Disk bytes | Installed plugin operation |
| --- | ---: | ---: | --- |
| `bindings/bindings.js` | 210 | 5,986 | Replace the bindings helper. |
| `@stroncium/procfs/lib/parsers.js` | 1,259 | 1,256 | Add `.js` to the dynamic parser path. |
| `node-pty/lib/utils.js` | 1,589 | 1,542 | Alias native runtime `require` calls. |
| `@vscode/ripgrep/lib/index.js` | 114 | 594 | Supply the copied executable's runtime path. |

The generator is `node_modules/@theia/bundle-plugin/lib/esbuild-plugin.js`.
Its 18,558 bytes have SHA-256
`bce311ef78a59d4ae795f55dea95794a5859c33810d2e4a2410d2ec3a2b3cce1`.
Its `onEnd` callbacks copy native PTY files, Ripgrep, and Trash helpers.
Those copied files do not become normal esbuild input records.
The Monaco localization plugin also redirects resolution to Theia's NLS module.
That resolution decision is not a captured content transformation.

### Report seam and strict check

`captureBuildPlugin(plugin, loadedSources, generatorPath)` wraps only registered
`onLoad` callbacks. It returns each original result unchanged. It copies the
exact returned string or binary bytes before later mutation. It preserves the
input namespace and suffix. Each build start clears the per-build record array.

`buildInputReport` accepts the resulting `loadedSources` array for each build.
It verifies input membership, byte counts, duplicates, and generator hashes.
It records the loaded-content hash separately from report-time disk hashes.
It rejects a generator that changes after capture. It does not store generated
text that can contain private absolute paths.

Inputs without a capture remain `loadedSource.status = "not-captured"`.
This includes same-size disk inputs. A size match does not exclude a transform.
Native wrappers without capture also remain unverified even when their referenced
binary has an exact disk hash. External imports receive an explicit unresolved
source record and a runtime, embedded-URL, or external-load classification.

`assertLoadedBuildInputsCaptured(report)` rejects uncaptured input bytes and
recorded external imports. A passing result covers only that narrow check.
It does not establish generator dependencies, dynamic loading, legal compliance,
or complete corresponding source. It is not automatically called by packaging.

The read-only reconstruction of the existing report gives:

| Build | Inputs | Captured loader inputs | Uncaptured loader inputs | Unique external path/kind pairs |
| --- | ---: | ---: | ---: | ---: |
| Browser | 3,370 | 1 | 3,369 | 3 |
| Backend | 2,326 | 0 | 2,326 | 70 |
| Electron | 17 | 0 | 17 | 1 |

The one captured browser transformation is the existing sanitizer replacement.
The strict loaded-input check correctly fails. No stored report is rewritten.

### Concrete external and dynamic gaps

The browser report has three embedded image URLs. They are not fetched runtime
modules, but their asset provenance remains separate from loader capture.
The backend's 70 unique external path/kind pairs contain 62 Node runtime pairs,
one Electron pair, and seven other pairs:

- `bufferutil` and `utf-8-validate`: optional external native loads.
- `pnpapi`: an external package-manager integration.
- `./build/Debug/watcher.node`: an unresolved native fallback path.
- `ai1-agents/lib/node/terminal-attention-hook`: a runtime `require-resolve` target.
- `ai1-agents/lib/node/session-shell-runner`: a runtime `require-resolve` target.
- `@vscode/windows-ca-certs`: an external platform-specific load.

The separate Electron build also imports the Electron runtime externally.
Node and Electron classification does not verify the packaged runtime's source.
Nonliteral PTY native loads, copied helper execution, extension deployment,
plugin-host loads, and nested polyfill inputs remain outside this static inventory.

The two AI1 `require-resolve` targets resolve to these current installed files.
Both files match the existing macOS payload byte-for-byte:

| Installed path | Bytes | SHA-256 |
| --- | ---: | --- |
| `extensions/agents/lib/node/terminal-attention-hook.js` | 3,653 | `c843cc41310886444dbf1c3bf762e8f1c1808e6207d664ba92bf229f67815169` |
| `extensions/agents/lib/node/session-shell-runner.js` | 2,161 | `795eb67a275415dad9448db8cb6e807ed9f218ffa127110de93c662b29a840fe` |

These are exact file candidates, not runtime execution or TypeScript compilation
records. `bufferutil`, `utf-8-validate`, `pnpapi`, and `@vscode/windows-ca-certs`
do not resolve from the current backend bundle location. Their absence does not
prove that all optional or platform-specific branches are unreachable.

### Parent integration and later build

No app configuration changes occur in this lane. The parent must wrap the
polyfill and native-dependency plugins before context creation. It must pass
separate `loadedSources` arrays with the browser and backend results.
Use the exact installed generator paths above. Do not reuse one array across
concurrent build contexts. Use one shared array for wrapped plugins in one context.
Pass absolute generator paths. For the polyfill plugin, use
`require.resolve("esbuild-plugins-node-modules-polyfill")`.
For the native plugin, use
`require.resolve("@theia/bundle-plugin/lib/esbuild-plugin")`.
The corresponding plugin names are `node-modules-polyfills` and
`@theia/esbuild-plugin`.

Wrapping captures the actual outer loader content. It does not expose the
polyfill plugin's nested metafile. Complete polyfill input coverage needs a
separately reviewed generator change that records nested inputs and their
loaded source bytes. Resolution redirects and copied assets need their own records.

After the dependency fix and parent integration, the following approved build
command regenerates the report. It does not run during this review.

```sh
npm run build:production
```

Review the new report before any package build or source-distribution claim.
Do not describe the 14 old virtual entries as fixed by this source-only change.

Nine build-report tests and six FFmpeg source tests pass. Repository lint,
focused formatting, and whitespace checks pass. Only temporary unit-test
fixtures invoke esbuild. No application build or Electron test runs.

## Embedded font metadata: 2026-10-07

This additional review uses installed font inputs and exact public source files.
It does not read the app package while the parent build changes it.
The earlier payload byte comparisons remain separate evidence.
No font reader, Python package, or other dependency is installed.
The checked setup has no available `fontTools`, `fonttools`, `ttx`, or
`woff2_decompress` executable.

The new `scripts/review-font-metadata.mjs` uses Node's existing zlib and Brotli
decoders. It follows the [OpenType name table](https://learn.microsoft.com/en-us/typography/opentype/spec/name),
[WOFF](https://www.w3.org/TR/WOFF/), and
[WOFF2 2024 Recommendation](https://www.w3.org/TR/2024/REC-WOFF2-20240808/).
It reads the untransformed name table. It does not reconstruct glyphs.
It also checks optional extended metadata and private-data blocks.
Private-data content stays uninterpreted. Every reviewed file has neither block.
Other font tables and glyph contents are outside this notice check.

The script preserves platform, encoding, language, name ID, raw string bytes,
and decoded text. It does not trim or translate strings. It distinguishes an
absent record, an empty string, and an unsupported encoding.
In these actual files, the missing copyright or license-description fields
are **absent records**, not empty strings. Absence is not permission.

### Exact embedded fields

The decoded Mac Roman and Windows Unicode records agree for each listed field.
The retained evidence is
`applications/electron/resources/third-party/font-metadata/review.json`.
It records font hashes, name-table hashes, exact field strings, absent field IDs,
archive integrity values, immutable source URLs, and proof limits.

Font Awesome 4.7.0 contains these exact records:

| Name ID | Field | Exact text |
| --- | --- | --- |
| 0 | Copyright | `Copyright Dave Gandy 2016. All rights reserved.` |
| 1 | Family | `FontAwesome` |
| 5 | Version | `Version 4.7.0 2016` |
| 7 | Trademark | `Please refer to the Copyright section for the font trademark attribution notices.` |
| 8 | Manufacturer | `Fort Awesome` |
| 9 | Designer | `Dave Gandy` |
| 11 | Vendor URL | `http://fontawesome.io` |
| 14 | License URL | `http://fontawesome.io/license/` |

Name ID 13, the license-description field, is absent. The copyright notice is
complete as an embedded copyright string. It does not contain complete license
terms. The URL does not supply those terms in the distributed font bytes.
The trademark record does not grant rights to third-party brand glyphs.

The other fonts contain these exact notice-related records:

| Font | Family, ID 1 | Version, ID 5 | Description, ID 10 |
| --- | --- | --- | --- |
| MFixx | `MFixx` | `Version 1.0` | `Font generated by IcoMoon.` |
| DevOpicons | `DevOpicons` | `Version 1.0` | `Font generated by IcoMoon.` |
| Octicons | `octicons` | `"Version 001.000 "` | Absent |

The quotes in the Octicons version cell show its trailing space. The quotes
are not part of the stored string. All three fonts lack name IDs 0, 7, 8, 9,
11, 12, 13, and 14. Octicons also lacks ID 10.
The IcoMoon string identifies font-generation software. It is not a copyright
notice, a manufacturer record, or permission to distribute the font.
Do not substitute IcoMoon's current terms for these absent records.

### Exact archive and source matches

The `font-awesome` 4.7.0 archive has 671,527 bytes and SHA-256
`92042b715919e17499ded134884b0318fd88041efac9b0f3204069df52222a61`.
The `file-icons-js` 1.0.3 archive has 295,024 bytes and SHA-256
`5dc01b1e46b96667a248ec86a5400551f0c3b5d8c2e1f13b257b3c10186b651f`.
Both downloads pass the current lockfile's SHA-512 integrity check.
All seven selected installed files match their archive entries exactly.

| Installed package and file | Bytes | SHA-256 |
| --- | ---: | --- |
| `font-awesome@4.7.0/fonts/fontawesome-webfont.ttf` | 165,548 | `aa58f33f239a0fb02f5c7a6c45c043d7a9ac9a093335806694ecd6d4edc0d6a8` |
| `font-awesome@4.7.0/fonts/fontawesome-webfont.woff` | 98,024 | `ba0c59deb5450f5cb41b3f93609ee2d0d995415877ddfa223e8a8a7533474f07` |
| `font-awesome@4.7.0/fonts/fontawesome-webfont.woff2` | 77,160 | `2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe` |
| `file-icons-js@1.0.3/fonts/fontawesome.woff2` | 77,160 | `2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe` |
| `file-icons-js@1.0.3/fonts/mfixx.woff2` | 24,412 | `3c43a6381718ebb2f903d3e3d1b565905445b1779c8cb190da923b07483e0931` |
| `file-icons-js@1.0.3/fonts/devopicons.woff2` | 49,764 | `a8fff171e045fabdbe8420baeb3519105dec0ff51094e43d6fbc55ab6bb59434` |
| `file-icons-js@1.0.3/fonts/octicons.woff2` | 20,248 | `256719a0ef15b92047b9eb3e3557509b9bf8177c5b76c6f4614004344bc333b9` |

The Font Awesome files also match source commit
`a8386aae19e200ddb0f6845b5feeee5eb7013687` byte-for-byte.
Its TTF, WOFF, and WOFF2 name tables all have SHA-256
`ed07d5717e0b343ba2ddaab21cb3b63e4f4f597b41c8a0c0683413008c5afe93`.
The File Icons JS Font Awesome WOFF2 has the same complete font bytes and table.
This identifies that copied font as Font Awesome 4.7.0 without borrowing terms
from an older or newer font.

MFixx WOFF2 matches `file-icons/MFixx` commit
`d0eac9f7ebc837e954dd98b784f5d2efd07f7e2f` at `dist/MFixx.woff2`.
DevOpicons WOFF2 matches `file-icons/DevOpicons` commit
`23fffde69c4a0395bfb2c3ede95084e2c46e6abf` at `dist/DevOpicons.woff2`.
The additional TTF and WOFF files at each of those commits have the same
name-table bytes as that family's WOFF2. Their file hashes are retained in
`review.json`. The checks do not assume that font conversion preserves notices.

All four selected File Icons JS fonts also match its registry source commit
`984e737370a5ce97b250b09f33f2571c585b8667`. Its source manifest reports 1.0.2,
not registry version 1.0.3. This mismatch stays visible.
The Octicons match identifies an exact package-source file, not the original
Octicons project release. Its internal version string does not identify one.

### Mapping proposals and remaining gaps

Proposed license supplement mappings: **none**. The inspected metadata does not
contain complete matching font license terms. It also cannot supply Font Awesome's
separate code license. No existing supplement or font-source mapping changes.

A justified source-only mapping is available for
`file-icons-js@1.0.3/fonts/fontawesome.woff2` to
`font-awesome@4.7.0/fonts/fontawesome-webfont.woff2` at the pinned source commit.
The matching hash is `2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe`.
Its exact copyright string is available for notice retention. Neither this
mapping nor that string clears the missing complete terms.

MFixx and DevOpicons still need complete modified-font terms and required
copyright notices. Octicons still needs an original release connection and
complete matching terms. Glyph design rights and trademark rights remain
separate from font-file distribution permission. No legal clearance is inferred
from missing strings, a URL, a family name, or a generation-software name.

The following read-only command inspects one named local font file.
It limits input and decompressed table data to 16 MiB. It limits aggregate name
string bytes and decoded extended metadata to 2 MiB each.

```sh
node scripts/review-font-metadata.mjs <named-font-file>
```

The following command runs isolated format fixtures and the offline regression
for the seven installed, hash-pinned font inputs. It does not install a reader
or build an app.

```sh
node --test scripts/review-font-metadata.spec.mjs
```

All nine font-metadata tests, repository lint, focused formatting, and whitespace
checks pass. The parser tests use isolated byte fixtures and named installed
fonts. No build, Electron run, app change, installation, or publication occurs.

### Parent integration result

The parent now wraps the two named plugins in `applications/electron/esbuild.mjs`
before context creation. Browser and backend builds have separate capture arrays.
The build rejects an absent or duplicate named plugin. Generated configuration
files stay unchanged.

The subsequent production build passes. The report has 3,370 browser inputs,
2,326 backend inputs, and 17 Electron inputs. It captures 15 browser inputs:
all 14 outer polyfill results and the existing sanitizer transformation. It
captures eight backend inputs: four native JavaScript wrappers and the four
disk-module transformations listed above. The report contains no local absolute
paths. The capture preserves the generated plugin results.

These records verify the exact outer loader hashes and byte counts. They do not
verify the nested polyfill input chain, default-loader snapshots, resolution
redirects, copied helper inputs, external loads, or complete distributed source.
The strict complete-loaded-input check still fails by design. The earlier table
describes the previous report, not the new build.

The parent adds package regressions for captured polyfills, native wrappers,
backend transformations, and SDK 1.31.0. Packaged validation follows the local
test-app rebuild. No binary publication or installed-app replacement occurs.
