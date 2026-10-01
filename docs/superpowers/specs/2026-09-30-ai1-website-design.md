# AI1 website design

Date: 2026-09-30

Status: draft for owner review; not approval to build, publish, or distribute

First scope: Product site + downloads (owner decision, 2026-09-30)

## 1. Goal and limits

Explain AI1 with real product evidence. Help a visitor check platform requirements.
Provide a download page and clear installation guidance. Publish a package link only
after the owner approves that release.

This spec is repository documentation. It does not create a website application.
The proposed routes, design tokens, budgets, and hosting choices need review.

The first site does not include accounts, payments, a web IDE, a newsletter, a CMS,
community services, or an enterprise sales flow. A blog and a full documentation
portal are not part of the first scope. Installation guidance is part of that scope.
Do not add a waitlist as a substitute for an unavailable download without approval.

Site publication and app distribution are separate decisions. The owner can approve
a product page while downloads remain unavailable.

## 2. Product facts and claim rules

### Verified repository facts

| Fact                                                                                                                       | Evidence                                                               | Website use                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AI1 means “All In 1”. It is a personal desktop IDE for coding agents across sibling Git repositories.                      | [README](../../../README.md), [base design](2026-09-21-ai1-design.md)  | Use this definition. Explain “meta-repo” in plain words.                                      |
| The default app has an explorer, center editor/diff/terminal/browser tabs, and right-side Changes and Agents views.        | Base design; `applications/electron/package.json`                      | Show the actual layout. Do not invent a new app interface for the site.                       |
| Agent status comes from the OpenCode service. Shell terminals use tmux.                                                    | [M2 design](2026-09-22-ai1-m2-agents-design.md)                        | Name OpenCode. Do not imply verified support for every agent CLI.                             |
| Browser profiles, local ports, agent tab handoff, find, zoom, viewport sizes, downloads, and history appear in the README. | README, Browser section                                                | Select a small set for demonstrations. Check each claim against the release used for capture. |
| Updates require user action. AI1 and bundled extension installation remain manual.                                         | [M4 spec](2026-09-28-ai1-m4-updater.md)                                | Do not say “automatic app updates”.                                                           |
| Current local macOS packaging targets arm64 and uses ad-hoc signing. The script disables publication.                      | `scripts/package-mac.sh`, `applications/electron/electron-builder.yml` | Do not describe this as a public Developer ID signed or notarized release.                    |
| The app uses a dark default theme and Material file icons. Existing AI1 logos have dark and light versions.                | App package; `applications/electron/resources/branding/`               | Reuse AI1 assets, subject to publication review.                                              |

These facts establish design inputs. They do not prove that an external installation
works. The website must describe the tested release, not all work on a feature branch.

### New owner direction

The planned WSL target is Ubuntu 26.04.1 x64 inside WSL2 with WSLg. The package target
is `.deb`. The owner has a Windows test machine. This is implementation direction,
not release evidence. See the [WSL design](2026-09-30-ai1-wsl-design.md) for product work.
This website task does not change that design or its implementation.

Until validation and release approval, use this status:

> Planned: Ubuntu 26.04.1 x64 under WSL2 with WSLg. Not supported yet. No public download is available.

Do not call this a native Windows application. Do not generalize it to all Linux
distributions, Windows versions, x64 Macs, or Linux arm64.

### Claims that need evidence or approval

- Public download availability, release channel, version, file size, and URLs.
- Minimum macOS and Windows versions; memory and storage requirements.
- Developer ID signing, notarization, Gatekeeper behavior, and public install safety.
- Public source access and the license for AI1. A dependency license is not AI1's license.
- Price, free use, subscriptions, commercial rights, or a support service.
- Customer counts, testimonials, company logos, stars, and performance comparisons.
- “Offline”, “private”, “secure”, or “all data stays local” claims. Agents, browser pages,
  extension downloads, and update checks can use external services.
- Any product function that appears only in a plan and lacks release validation.

Keep a claim register during implementation. Each entry needs a source, release or
commit, check date, reviewer, and approved wording. Remove unsupported claims.

## 3. Position and audiences

### Proposed position

AI1 is a desktop workspace for code, changes, OpenCode sessions, terminals, and a
browser across one folder of sibling repositories. The site shows how these parts
work together. It does not sell an AI model or promise an autonomous development team.

Proposed headline:

> Code, agents, and your repositories. All in one app.

Proposed supporting text:

> AI1 puts your editor, changes, OpenCode sessions, terminals, and browser in one desktop workspace.

These are draft AI1 words, not copied reference copy. The owner approves final copy.
Use concrete actions instead of claims such as “100x faster”.

### Primary audiences

1. Developers on Apple Silicon Macs who use OpenCode and work across sibling repositories.
2. Developers who want to review agent work beside files, diffs, and a local browser.
3. Developers who assess the planned WSL target and need exact support status.

The first two groups need a product explanation, a real demonstration, and clear
setup costs. The third group needs a visible limit, not a false download promise.
Do not imply that the owner currently offers team support or enterprise features.

## 4. Reference research

Research date: 2026-09-30. Read [T3 Code][R1] and [Orca][R2] as public website data.
Inspect desktop screenshots through the available Playwright browser. The built-in
browser is disconnected, so it is not the source of the visual observations.

### Observed visual facts

**T3 Code:** The desktop view has a near-black background and a fine grid behind the
hero. A small header precedes a large centered multiline heading. Muted supporting
text sits above a bright primary download button. Floating agent-logo tiles surround
the hero. A large app image follows it. Bordered testimonial cards follow the image.

**Orca:** The desktop view has a near-black background and a horizontal header. A
large centered heading precedes muted supporting text. A bright download action and
an outlined source action sit together. A horizontal feature selector precedes a
large framed app view. A company-logo row and another feature selector follow it.

These are visual facts from the inspected desktop views. Exact fonts, colors,
spacing values, implementation frameworks, mobile behavior, and accessibility
compliance are not established by those screenshots. Do not claim them as facts.
The inspection does not constitute a full interaction or motion audit.

### Text-only observations

T3 Code's extracted page text includes provider setup, Git review, source access,
testimonials, platform links, and repeated download actions. Orca's extracted text
includes feature groups, workflow demonstrations, platform links, FAQ, comparison
content, and repeated download actions. These observations establish content
structure, not the visual layout of every lower-page section.

### AI1 adaptation

| Reference pattern                       | Proposed AI1 use                                                | Do not copy                                       |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Short hero with one main action         | Explain the desktop workspace; link to the download/status page | Headline, taglines, superiority claims            |
| Product evidence immediately after hero | One authentic AI1 overview screenshot                           | Reference screenshots, app UI, demo data          |
| Feature demonstrations grouped by work  | Three AI1 workflow sections                                     | Orca's selector design or unverified feature list |
| Requirements near download action       | Show architecture and release status                            | Reference platform support claims                 |
| Repeated final action                   | Repeat the download/status route after FAQ                      | Fake urgency or unavailable download links        |

Use AI1's own name and black-and-white mark. Do not import reference branding,
provider-logo decorations, testimonials, company logos, icons, source code, or
assets. Do not recreate either page pixel for pixel. Omit social proof until AI1
has real evidence and permission to publish it.

## 5. Information architecture

Recommended first routes:

| Route            | Purpose                                                                | Release rule                                                   |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/`              | Product overview, workflow evidence, requirements summary, FAQ         | Can explain the product without active package links           |
| `/download`      | Platform cards, status, release details, checksums, installation links | Render links only for approved and available packages          |
| `/install/macos` | Apple Silicon prerequisites and installation steps                     | Distinguish local source build from an approved binary release |
| `/install/wsl`   | Planned target and, after validation, exact WSL installation steps     | Before validation, show planned status and limits only         |
| `/privacy`       | Website data use and outbound-service disclosure                       | Needs a factual review of the chosen host and services         |

Add an accessible 404 page. Link a changelog or source repository only if there is
an approved public destination. Do not expose a private repository URL as a public
call to action. Do not create empty pricing, enterprise, community, or legal pages.
Add terms or license content only after the owner selects and reviews those terms.

### Home page order

1. **Header:** AI1 mark and name; links to Workflow, Requirements, FAQ, and Downloads.
   Use ordinary anchors for in-page sections. The header action opens `/download`.
2. **Hero:** proposed headline, one short explanation, and a clear status line.
   Current action: “View Download Status”. Secondary action: “See the Workflow”.
   After release approval, the main action can read “Download for macOS” and still
   lead to the page that explains the package and prerequisites.
3. **Product overview:** authentic app capture with a text caption. Show the
   explorer, a working center tab, and repository changes or agent status.
4. **Workflow:** three short sections: “Open Your Repositories”, “Review Agent Work”,
   and “Check the Running App”. Each pairs text with an actual feature capture.
5. **Focused functions:** changes across repositories, OpenCode status, tmux-backed
   shells, and browser profiles/ports. Use four short items, not a large claim grid.
6. **Requirements and status:** macOS Apple Silicon first; planned WSL target second.
   Separate source-build tools from runtime prerequisites. Link installation guidance.
7. **FAQ:** what AI1 is; what a meta-repo is; required agent tools; macOS availability;
   WSL status; manual app updates; browser profile handling. Do not invent price answers.
8. **Final action:** “View Downloads and Requirements”. Repeat the current status.
9. **Footer:** AI1 name, installation links, privacy, and approved public project links.
   Do not invent a company name or a support email address.

Keep sections readable without JavaScript. Prefer a static vertical workflow over
an auto-advancing feature carousel. A short first page can use native `<details>`
for FAQ instead of a client accordion library.

## 6. Download and installation design

### Release states

Use one reviewed release record as the source for page copy and actions. Proposed
fields: platform, architecture, channel, version, tested OS range, publication
approval, validation evidence, artifact URL, size, SHA-256, signing status,
release notes URL, and installation guide route. These are website fields, not
a new requirement to change the app updater.

An artifact URL alone does not make a release available. Require validation,
publication approval, and an actual artifact. An unavailable card shows text and
an installation/status link. It has no disabled fake download anchor.

| Current card                                    | Current status and action                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| macOS · Apple Silicon (arm64)                   | Local ad-hoc signed build exists. Public distribution is not approved. No public download link. Show requirements and local-build status. |
| WSL2/WSLg · Ubuntu 26.04.1 · x64 · planned `.deb` | Not supported yet. Validation on the owner's Windows machine and release approval are required. No download link.                         |

Do not auto-download. Keep platform choices visible on all visitor operating
systems. If detection appears later, use it only as a hint. Do not infer CPU
architecture from the user agent or hide another platform's guide.

### macOS guidance

- State Apple Silicon arm64. Do not promise Intel support.
- Publish the minimum macOS version only after a clean-machine check.
- For source builds, list Node 24, Xcode command line tools, Python 3, and the
  system compiler configuration from the README. Explain that source access
  is required and is not currently an approved public offer.
- Document OpenCode and tmux separately for agent sessions and persistent shells.
  Confirm runtime versions and installation commands for the selected release.
- Explain that the current local app uses ad-hoc signing, not notarization or
  a Developer ID identity. Do not present a local package as consumer-ready.
- Keep source-build instructions and binary-install instructions separate.
  Do not tell visitors to install build tools for a packaged app without evidence.
- After distribution approval, show the actual file type, version, architecture,
  size, checksum, signature status, install path, first-run steps, and removal steps.
- Test first launch on a clean Mac. Describe actual Gatekeeper behavior. Do not
  recommend global security changes or routine quarantine removal.
- State that AI1 and bundled extension updates require a manual build/install in
  the current implementation. A website download must not imply auto-update support.

### Planned WSL guidance

Before validation, explain the target and the support limit. Do not publish an
untested installation command sequence as supported guidance.

After validation and approval, the guide must name the tested Windows build,
WSL version, WSL2 requirement, WSLg requirement, Ubuntu 26.04.1 distribution, and
x64 architecture. Use actual recorded checks from the Windows machine.
Explain that AI1 runs as a Linux GUI app inside WSL, not as a native Windows IDE.
Keep repositories, OpenCode, tmux, and the app back end in the same distribution.
Explain Linux filesystem placement and any measured limits for Windows-mounted paths.

Document the real `.deb` filename, checksum check, package installation command,
launcher, first start, update, removal, and prerequisite error behavior. Derive
commands from the completed packaging work. Do not invent a filename or URL now.
Check terminal persistence, browser pages, agent connection, fonts, clipboard,
file access, and repository changes on the real Windows host before claiming support.

## 7. Visual system

### Brand inputs

Use `applications/electron/resources/branding/logo-dark.png` and `logo-light.png`
as the identity source. Visual inspection shows a heavy geometric AI1 wordmark
in a monochrome square. The app icon script gives it a rounded-square face.
No approved website font or website token system appears in the inspected files.

Preserve the mark's proportions. Do not stretch, retype, trace, or animate its
letters. The source logo has large outer space; approve a website export with
a suitable crop before using it as a small header mark. Keep the source unchanged.
Use a text label beside a small mark if the asset is not legible at header size.

### Proposed tokens, not established brand values

| Role                       | Recommendation                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| Page background            | `#161616`                                                                  |
| Raised surface             | `#222222`                                                                  |
| Main text                  | `#F5F3EF`                                                                  |
| Secondary text             | `#B8B8B8`                                                                  |
| Decorative border          | `#383838`; do not use this alone for control boundaries                    |
| Control boundary and focus | High-contrast neutral outline; test at least 3:1 against adjacent surfaces |
| Main action                | Off-white surface with near-black text                                     |
| Status                     | Text plus icon; use app capture colors only inside screenshots             |

These neutral tokens follow the observed AI1 identity. Confirm contrast in the
implemented states. Do not invent a bright brand accent without owner approval.
Set `color-scheme: dark` and a matching theme color for the proposed dark site.
A light site theme is optional follow-up work, not a first-scope requirement.

Use a system sans-serif stack first. An approved self-hosted variable sans font
is an alternative. Use a system monospace stack for commands. Do not mimic a
reference font merely to reproduce its appearance.

Recommended scale: body 16–18 px, line height 1.5–1.7; hero heading 36–72 px with
fluid `clamp()` sizing; section headings 28–44 px. Keep text measure near 60–70
characters. Use balanced heading wraps without fixed desktop line breaks on phones.

Use a content width near 1,120 px, 20–32 px side space, and a spacing scale based
on 4/8 px. Use 8–16 px radii, thin borders, and limited shadows around real product
media. Give each section one main idea. Avoid glowing gradients, floating provider
logos, decorative terminal walls, and heavy background grids.

## 8. Authentic product media

Capture the actual AI1 release in a small, non-private fixture meta-repo. A mock
app image is not evidence. Do not capture another product or alter AI1 controls.

Required media plan:

1. Overview: explorer, editor or diff, and right-side Changes/Agents context.
2. Review: sibling repository changes and a readable file diff.
3. Agent: OpenCode session status and its terminal; verify any blocked-state example.
4. Browser: local fixture app with Ports or profile context. Show handoff only
   after checking it in the captured release.

For each capture, record AI1 commit/version, platform, date, workflow, and alt text.
Check credentials, local paths, prompts, private code, cookies, history, email
addresses, and MCP secrets before export. Prefer synthetic fixtures to redaction.
If redaction is necessary, disclose it and do not change the feature behavior.

Keep screenshots at native aspect ratio. Supply readable detail crops on small
screens, plus a link to the full still. Do not shrink a dense IDE image and expect
its text to explain the product. Captions carry the main meaning in HTML.

Optional demo: 20–40 seconds with an explicit Play action, poster, controls,
captions for meaningful audio, and a text transcript of important visual actions.
For narrated video, describe important visual actions in the audio track. Do not
load video data before interaction. Prefer local MP4/WebM over a third-party player.
Do not autoplay audio or add an infinite decorative demo loop.

WSL media must come from the actual validated Windows setup. A macOS image does
not prove WSL support. Current research does not produce approved app screenshots.

## 9. Accessibility, responsive layout, and motion

Target WCAG 2.2 AA. Apply the [Web Interface Guidelines][R10] as a review checklist.
Automated tests do not replace manual checks.

- Use semantic header, nav, main, sections, headings, and footer. Use one page h1.
- Add a visible-on-focus skip link. Keep keyboard order the same as reading order.
- Use links for routes and buttons for actions. Label icon-only controls.
- Keep focus visible and unobstructed. Add anchor scroll margin if the header is sticky.
- Test 4.5:1 normal text contrast and 3:1 large text/control contrast. Status does
  not depend on color. Meaningful images need useful alt text; decoration has empty alt.
- Aim for 44 × 44 CSS px touch controls. Meet WCAG target-size requirements.
- Support keyboard FAQ, media controls, and any menu. A dialog needs Escape,
  focus containment, a close button, and focus return. Prefer no image dialog initially.
- Test 200% text zoom, 400% page zoom, and reflow at 320 CSS px. Do not disable zoom.
- Test VoiceOver with Safari and at least one desktop keyboard-only session.
  Check announced platform, unavailable states, headings, and download link purpose.
- Avoid a mobile menu if four links can wrap cleanly. If needed, make it a small
  client component with a native button, expanded state, and a clear close action.
- Use CSS Grid/Flexbox and content-based breakpoints. Suggested checks: 320,
  390, 768, 1024, and 1440 px. Stack workflow sections below roughly 768 px.
- Keep text before media in reading order. Stack actions on narrow screens.
  Tables need a readable stacked alternative or a labeled scroll area.
- Preserve safe-area space. Fix overflow rather than hiding essential content.
- Honor `prefers-reduced-motion`. Remove entrance movement, smooth scrolling,
  decorative loops, and auto-advancing content. A still poster remains available.
- If small transitions help, use explicit opacity/transform transitions around
  120–200 ms. Do not use `transition: all`, parallax, or scroll-driven reveals.
- Render all essential content immediately. Motion cannot gate access to content.

## 10. Next.js implementation recommendations

Use the stable Next.js App Router with TypeScript. Recheck the current supported
release and security patches at implementation time. The official pages retrieved
on 2026-09-30 identify documentation versions 16.3.6/16.3.7; that is not approval
to pin an unverified package version. Use the release's compatible React versions.

### Rendering and boundaries

- Keep layouts, pages, static copy, feature sections, and release records as
  Server Components by default [R3]. Do not put `use client` on the root layout.
- Pre-render product and installation pages at build time. Approved release data
  lives in reviewed local content. A rebuild publishes a content change.
- Use small client boundaries only for a necessary menu, copy button, or media
  interaction. Native FAQ details and normal links do not need React state.
- Pass small serializable props across boundaries. Keep release validation and
  private configuration on the server/build side. Do not serialize full records
  or secrets when a client needs only a label and public destination.
- The first scope needs no database, authentication, Server Actions, or runtime
  API. Do not add them to make a static product page appear more sophisticated.

### Data and dependency discipline

Use local data for the first release. Do not fetch stars, testimonials, latest
versions, or app support status in the visitor's browser. This avoids stale claims,
third-party failures, and fetching waterfalls.

If approved remote content becomes necessary, fetch on the server or during the
build. Start independent requests together and await them with `Promise.all` [R4].
Set an explicit caching/freshness policy for the selected Next.js version. Current
fetch guidance does not cache `fetch` results by default. Do not assume old defaults.
React `cache` deduplicates within a request; it is not a persistent release cache.
Use bounded timeouts and checked errors. A failed essential release check fails
the publishing build; it must not produce an unverified download action.

Do not call the site's own Route Handler from a Server Component. Do not add a
client query library for fixed copy. Use route splitting and direct imports.
Avoid large icon libraries, animation engines, syntax highlighters, and carousel
packages. Load an optional heavy client feature only when the user activates it.

### Images and fonts

Use optimized local screenshots, explicit dimensions, and responsive `sizes`
[R5, R6]. Prefer WebP after a readability check. Only the actual LCP image needs
early loading. Follow the chosen version's `fetchPriority`, eager loading, or
`preload` guidance; do not preload every screenshot. Next.js 16 deprecates the
old Image `priority` prop. Lazy-load lower-page images.

Use system fonts or `next/font/local` with licensed WOFF2 files [R7]. `next/font/google`
self-hosts at runtime but can fetch files during the build. Local files avoid that
build dependency. Limit font families and weights. Do not make browser requests
to a font provider. Check fallback metrics and layout shift.

### Static hosting decision

Recommendation: keep the first site static. The owner still selects the host.
Two standard options remain open:

1. Static export with `output: 'export'` on an approved static host. Server
   Components execute at build time. Runtime APIs, Server Actions, ISR, and the
   default Next image optimizer are not available [R8]. Pre-generate responsive
   local media variants or use an approved compatible loader. An `unoptimized`
   flag alone is not an image optimization strategy.
2. Standard Next.js hosting with statically rendered routes and the built-in
   image optimizer. Vercel is an option, not an approved destination. Self-hosted
   Next.js is also an option if the owner accepts runtime maintenance.

Select the hosting and image strategy together. For static export, configure
security headers and redirects at the host, not unsupported Next configuration.
Do not require a paid image service for the initial site.

A future site can live in a separate repository or a workspace selected by the
owner. Avoid coupling its React/TypeScript dependencies to the Theia app. The
present repo uses TypeScript 5.4.5; check modern Next.js compatibility before
choosing a workspace. No application folder is approved by this spec alone.

## 11. SEO and sharing

Use static App Router Metadata exports and metadata files [R9]. Proposed home
title: “AI1 — All In 1 Desktop Workspace”. Proposed description:

> Review code, repository changes, OpenCode sessions, terminals, and browser pages in one desktop workspace.

Each installation page gets a specific title and an accurate availability
description. Do not use “Download AI1 for Windows” while WSL is unsupported.

After domain approval, set `metadataBase`, canonical URLs, Open Graph URL,
`siteName`, title, description, and Twitter large-image metadata. Do not insert
a guessed domain. Use an original static 1200 × 630 sharing image with the AI1
mark and a short product description. Include image alt text. Show no false
download or support statement in that image.

Provide icons derived from approved AI1 exports, a sitemap of approved public
routes, and production robots rules. Keep previews `noindex`; use access control
if previews contain private content. Robots rules do not provide access control.
Check the actual output HTML and crawler-visible metadata before release.

Do not add review ratings, price offers, or download structured data without
verified facts. Structured data is optional, not a first-release dependency.

## 12. Privacy, analytics, and security

Recommendation: no analytics scripts, advertising, tracking cookies, session
replay, embedded social posts, or third-party media players for the first site.
The owner has not approved an analytics provider or data collection purpose.
Self-host media and fonts. Ordinary outbound links remain available.

The host can still keep access logs. Before publication, document the chosen
host, data fields, retention, access, processing locations, and contact route.
Do not say “we collect no data” before this review. Separate website privacy
from app and model-provider behavior. Do not infer a privacy policy from local
app architecture.

If the owner later approves measurement, prefer aggregate counts with no user
profiles. Define allowed events, retention, consent needs, and legal review
before implementation. Never send file paths, repository names, prompts, or
page query secrets. Delay approved nonessential scripts and keep them outside
the main rendering path. A “cookieless” label does not settle privacy obligations.

Use HTTPS, reviewed CSP compatible with the selected Next build, anti-framing
policy, MIME sniffing protection, referrer policy, and a limited permissions
policy. Keep secrets out of public variables and static output. Check outbound
destinations. Do not expose local agent endpoints or browser debugging ports.
Do not add a contact form until ownership, validation, spam controls, and data
handling have approval.

## 13. Proposed performance budgets

These are acceptance targets, not measurements of the current app or website.
Measure the production site, not `next dev`.

| Metric                                  | Proposed target                                                 | Check                                                                              |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| LCP                                     | At most 2.5 seconds                                             | Mobile production Lighthouse lab check; field p75 when enough approved data exists |
| INP                                     | At most 200 ms                                                  | Interaction traces before launch; field p75 if collection has approval             |
| CLS                                     | At most 0.1                                                     | Production lab and manual loading checks                                           |
| Lighthouse performance                  | At least 90                                                     | Median of 3 runs with fixed mobile throttling                                      |
| Lighthouse accessibility and SEO        | 100 target; no known critical failures                          | Automated audit plus manual review                                                 |
| Initial route JavaScript                | At most 150 KiB compressed, including framework                 | Production build/network report; report compression type                           |
| Site-specific client JavaScript         | At most 30 KiB compressed                                       | Bundle analysis                                                                    |
| Initial page transfer                   | At most 1 MiB at a 390 px viewport, excluding user-played video | Cold-load network report                                                           |
| Hero still                              | At most 250 KiB mobile; 500 KiB desktop                         | Actual selected responsive asset                                                   |
| Web fonts                               | At most 100 KiB total; 0 with system fonts                      | Network report                                                                     |
| Third-party requests before interaction | 0 by recommendation                                             | Cold-load network inspection                                                       |

Use a fixed test device/profile, browser version, connection profile, and release
commit. Record results. A lab score cannot prove field INP. If text readability
needs a larger image, review and record a budget change instead of silently
blurring product evidence. Check the full page for delayed large downloads.

## 14. Build, test, hosting, and release requirements

Implementation needs its own approved plan. No deployment or package publication
occurs as part of this draft.

### Build and test

- Pin the reviewed Next.js/React/tool versions through a lockfile. Select a
  supported Node LTS version compatible with the site and CI. Node 24 matches
  the current repo baseline, subject to the selected Next version check.
- Run an explicit ESLint command, TypeScript check, content/link tests, and
  production `next build`. Do not assume the build also runs lint.
- Check formatter output only within the website scope during implementation.
- Test release-state logic: planned, validation incomplete, approval absent,
  unavailable artifact, approved package, and withdrawn release. Never render
  a download link for the first four unavailable states.
- Test route loading, anchors, FAQ, keyboard flow, reduced motion, media controls,
  missing media, 404 behavior, and basic navigation with JavaScript disabled.
- Test approved HTTPS artifact links and published checksums. Compare each
  checksum with the exact downloaded file before public approval.
- Use Playwright for responsive smoke checks and axe for automated accessibility.
  Run manual Safari/VoiceOver and keyboard checks. Test Chrome, Firefox, and
  Safari; include a real touch device if available.
- Inspect build output for static routes, unexpected client boundaries, secrets,
  unapproved network destinations, metadata, and dependency size [R11].

### Hosting and publication

The owner selects host, domain, budget, region, account owner, and release owner.
Require HTTPS, correct nested-route/404 handling, preview isolation, immutable
cache headers for hashed assets, reviewed HTML cache behavior, and rollback to
a known site build. Do not use a private source repository as a public artifact host.

Use an approved release artifact store for app packages. Keep binary publication
separate from website deployment. Review bandwidth costs, file retention, and
link durability. Do not publish locally generated packages as an incidental CI step.

Require a human publishing gate for release status. Record who approves the
site, platform validation, legal/distribution terms, and package publication.
Keep the previous approved site and release metadata available for rollback.
If an artifact is removed or unsafe, remove its action and show an accurate
status. Do not redirect silently to a different architecture or untested build.

### Platform release gates

For macOS, check the actual approved distribution method, code signature,
notarization decision, clean-machine installation, first launch, and removal.
Ad-hoc signing remains a local-build fact until the owner explicitly accepts
and approves a public distribution policy.

For WSL, collect the real Windows-machine validation results for Ubuntu 26.04.1
x64, WSL2, WSLg, and the `.deb`. Tests and package creation on another platform
do not satisfy this gate. A successful validation still needs publication approval.

## 15. Implementation slices and success criteria

| Slice                     | Deliverable                                                                        | Completion check                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0. Decisions and evidence | Approved site location, host strategy, domain plan, claim register, release states | No unresolved choice blocks the next slice; no publishing authorization is inferred           |
| 1. Product shell          | Server-rendered home page, AI1 identity, responsive navigation, unavailable status | Core explanation and links work without JavaScript; owner approves visual direction           |
| 2. Product evidence       | Actual overview and workflow stills, captions, optional deferred demo              | Captures match checked product functions and contain no private data                          |
| 3. Downloads and guides   | Download status route, macOS guide, planned WSL guide, typed release records       | No unapproved package link; platform and prerequisites remain clear on mobile                 |
| 4. Quality and privacy    | Metadata, sharing image, privacy text, accessibility and performance checks        | Production build, lint, type check, route tests, and budgets pass or have reviewed exceptions |
| 5. Site publication       | Approved preview and production site release                                       | Owner approves host/domain/content; rollback and preview isolation work                       |
| 6. Package activation     | Links for each separately approved platform release                                | Actual artifact, checksum, clean-install evidence, and release approval all exist             |

Slices 5 and 6 are separate. WSL can remain planned after the product site launches.
The first site is complete when a visitor can explain AI1's purpose, see real
product evidence, find the correct platform status, and understand the next
installation step without a misleading claim.

## 16. Open owner decisions

1. Website repository or workspace location and dependency isolation.
2. Static export or standard Next hosting; host, account, budget, and domain.
3. Public product-page publication timing and whether unavailable downloads
   are acceptable at that time.
4. Public app distribution approval, AI1 license/terms, artifact storage, and
   release owner. Source publication is a separate choice.
5. macOS distribution method, Developer ID/notarization policy, tested OS range,
   and clean-machine validation requirements.
6. WSL validation results and support wording for the selected Windows/Ubuntu
   environment. The target is selected; support approval is not.
7. Final headline, logo export, font choice, fixture content, and media approval.
8. Privacy contact, host log retention, and whether any analytics is necessary.
9. Whether public release notes and a support destination exist at first launch.

These decisions do not block this draft. They block only the implementation or
publication actions that depend on them.

## 17. Sources and research limits

All external sources below are accessed on 2026-09-30. Current official Next.js
pages are the source for framework recommendations. The two product websites
are inspiration sources only; their marketing claims are not AI1 facts.

- [R1: T3 Code][R1] — text structure and observed desktop visual hierarchy.
- [R2: Orca][R2] — text structure and observed desktop visual hierarchy.
- [R3: Next.js Server and Client Components][R3] — defaults and client boundaries.
- [R4: Next.js Fetching Data][R4] — parallel work, caching, and request deduplication.
- [R5: Next.js Image Optimization][R5] — local assets and layout stability.
- [R6: Next.js Image Component][R6] — responsive sizes and current loading props.
- [R7: Next.js Font Optimization][R7] — self-hosting and font loading.
- [R8: Next.js Static Exports][R8] — static build behavior and unsupported runtime features.
- [R9: Next.js Metadata and OG Images][R9] — metadata exports and static sharing assets.
- [R10: Vercel Web Interface Guidelines][R10] — interface review checklist.
- [R11: Next.js Production Checklist][R11] — production build and quality checks.
- [R12: WCAG 2.2][R12] — accessibility acceptance standard.

The loaded `vercel-react-best-practices` skill also informs the waterfall,
bundle-size, server/client boundary, and dependency recommendations. It is a
local guidance source, not evidence of product support.

Research does not verify reference mobile behavior, reference performance,
AI1 public distribution, AI1 clean-machine installation, or WSL support. Those
checks remain part of later validation. No website app is present in this task.

[R1]: https://t3.codes/
[R2]: https://www.onorca.dev/
[R3]: https://nextjs.org/docs/app/getting-started/server-and-client-components
[R4]: https://nextjs.org/docs/app/getting-started/fetching-data
[R5]: https://nextjs.org/docs/app/getting-started/images
[R6]: https://nextjs.org/docs/app/api-reference/components/image
[R7]: https://nextjs.org/docs/app/getting-started/fonts
[R8]: https://nextjs.org/docs/app/guides/static-exports
[R9]: https://nextjs.org/docs/app/getting-started/metadata-and-og-images
[R10]: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
[R11]: https://nextjs.org/docs/app/guides/production-checklist
[R12]: https://www.w3.org/TR/WCAG22/
