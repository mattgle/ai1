# AI1 M3b part B: Design Mode and annotations

**Status:** implemented. Element selection, bounded context, per-tab feedback,
screenshot drawing, copy, and send exist. E2e covers selection, drawing, and
sending the comment and PNG attachment to the selected session.
**Extends:** `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md` and
`docs/superpowers/specs/2026-09-25-ai1-m3b-a-browser-basics-design.md`.

## Goal

Let the owner select parts of a page, add visual feedback, and send that
feedback with page and element context to an OpenCode session.

## User flow

1. The owner starts Design Mode from a browser tab.
2. The owner points to and selects an element. AI1 shows a bounded preview of
   its text, HTML, useful computed styles, location, and screenshot.
3. The owner adds a short comment. The owner can add more selections on the
   same page, edit or remove them, and draw on a page screenshot.
4. The owner chooses an OpenCode session and sends the collected feedback.
   AI1 also lets the owner copy the feedback instead.
5. The owner can cancel selection with Escape and clear the feedback for the
   current page.

## Boundaries

- The browser page is untrusted. The main process validates all data from it.
- AI1 limits payload size and removes sensitive values before it shows or sends
  page data. It removes URL query strings and fragments. It does not render page
  HTML as markup in AI1.
- The browser guest gets no new preload access for this feature. AI1 runs a
  short-lived, fixed selection script in the registered guest.
- Feedback belongs to the current browser tab and page. Navigation clears it.
- The screenshot stays in memory until the owner copies or sends it. AI1 does
  not save page screenshots to disk.
- Sending uses the OpenCode service. AI1 does not type into a terminal.
- Orca code may be adapted where it fits. Keep the MIT notice with any adapted
  code.

## Scope

In scope: page element selection, safe page context, a comment per selection,
screenshot markup, an annotation list, copy, and send to a selected OpenCode
session.

Out of scope: persistent annotation history, shared annotations across browser
tabs, live collaboration, editing the page DOM, and sending feedback to a
remote service other than the configured OpenCode service.

## Open implementation check

Before sending screenshots, verify the installed OpenCode service's supported
message-part format. If it cannot accept an image part, stop before building a
text-only send path and report the limit. Do not put base64 image data into a
plain text prompt.
