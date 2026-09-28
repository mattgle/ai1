# AI1 M3b part B: Design Mode and annotations — Plan

**Spec:** `docs/superpowers/specs/2026-09-28-ai1-m3b-b-design-mode.md`.

## Tasks

1. Verify the OpenCode message API for text and image parts. Add a fake-server
   test for the accepted request. Stop if image parts are not supported.
2. Add bounded shared types and a main-process validator for page selection
   data. Test malformed data, long fields, URL secrets, and unsafe attributes.
3. Add the guest selection script and main-process calls to arm, cancel, and
   return one selected element. Test lifecycle, navigation, and guest teardown.
4. Add the browser toolbar mode, safe selection capture, and screenshot
   drawing. Test cancel, screenshot failure, and keyboard focus. Done.
5. Add per-tab feedback with edit, delete, clear, and copy actions. Clear
   them on page navigation and tab disposal.
6. Add an OpenCode session picker and send the bounded text and image parts.
   Test that AI1 targets only the selected session and shows send failures.
7. Add hidden-window e2e coverage for selection, annotation, and send. Update
   the M3a spec change notes. Done. The full hidden e2e suite passes.

## Checks

- Run browser-pane and agents unit tests after each task.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before completion.
- Run `npm run test:e2e` in hidden mode. Never show or focus an e2e window.
- Do not push or install the application without the owner's approval.
