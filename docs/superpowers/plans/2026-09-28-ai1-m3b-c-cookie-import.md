# AI1 M3b part C: Browser cookie import — Plan

**Spec:** `docs/superpowers/specs/2026-09-28-ai1-m3b-c-cookie-import.md`.

## Tasks

1. Detect Chrome, Arc, and Brave profiles from fixed macOS locations. Show only
   browser name and profile name to the renderer.
2. Read Chromium's cookie database in read-only mode. Decrypt supported cookie
   values with the browser's Keychain Safe Storage secret.
3. Validate source and target profile ids in the main process. Merge cookies
   into only the chosen AI1 profile. Keep cookie values out of logs and IPC
   results.
4. Add an explicit confirmation and result summary to **Browser: Manage
   Profiles**.
5. Add unit tests for profile detection, key derivation, expiry, skips, and
   target isolation. Add a hidden e2e test for confirmation and UI wiring.
6. Update the M3a spec change notes. Run lint, type checks, unit tests, and
   hidden e2e tests.

## Checks

- Do not clear the target cookie store before import.
- Do not show or print cookie values or Keychain passwords.
- Do not test against or modify the owner's real browser profile.
