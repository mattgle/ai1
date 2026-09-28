# AI1 M3b part C: Browser cookie import

**Status:** initial implementation in progress.
**Extends:** `docs/superpowers/specs/2026-09-23-ai1-m3a-browser-design.md`.

## Goal

Let the owner copy supported login cookies from Chrome, Arc, or Brave on macOS
into one selected AI1 browser profile.

## User flow

1. The owner opens **Browser: Manage Profiles** and selects **Import Cookies…**.
2. The owner chooses the AI1 target profile and the source browser profile.
3. AI1 explains that cookies can give sites access to accounts. The owner must
   confirm before AI1 reads and copies the cookies.
4. AI1 reports the number of cookies imported and skipped.

## Boundaries

- The importer runs only in Electron's main process. Renderer requests contain
  source family and profile directory names, never source paths or cookie data.
- AI1 resolves the source path from a fixed macOS browser root and checks the
  profile directory before it opens the SQLite database read-only.
- AI1 reads the browser's Safe Storage password from macOS Keychain. It does
  not log or return the password or cookie values.
- AI1 supports Chromium `v10` and `v11` cookie encryption on macOS. Other
  versions, invalid rows, expired cookies, and Google cookies are skipped.
- AI1 merges cookies into the selected target. It does not clear that profile's
  cookie store. The target browser's cookie store replaces matching cookies.
- AI1 imports cookies in memory and does not write a plaintext staging file.
- Other operating systems and browsers are not supported by this part.

## Out of scope

Safari, Firefox, Windows, Linux, file-based cookie imports, Chromium app-bound
`v20` decryption, cookie-store rollback, and import of local storage or site data.
