# M2 measurements

Date: 2026-09-23
Workspace: the same meta-repo as M1, 41 sibling repositories, `node_modules`
installed in 26 of them.

| Measurement | Result |
|---|---|
| Processes | 9 |
| Memory at idle (RSS, all processes), Agents view open and connected | 1021 MB |
| CPU at idle, 2 minutes after start | 0.2 % |
| RSS of one OpenCode interface tab (`opencode --session`) | 185 MB |
| RSS of the OpenCode service | 1452 MB |

The measurement ran on the packaged app before the fixes of the final review. The gate results below are from the final state.

## Conclusion

The idle load stays close to the M1 baseline (972 MB, 0.1 % CPU). With the
Agents view open and its event stream connected, memory grows by about 49 MB
and CPU stays near zero. Each open OpenCode interface tab adds about 185 MB,
in line with the design's own estimate. The OpenCode service runs on its own,
outside AI1, and keeps running after AI1 closes. No change of the idle
configuration is necessary.

## The seven M2 criteria

| # | Criterion | Proof | Result |
|---|---|---|---|
| 1 | The Agents view lists the OpenCode sessions of the workspace, grouped by repository, with the live status | `e2e/src/m2-agents.spec.ts`: "the Agents view lists the fixture session under its repository"; "a prompt moves the card to working and then to done" (a real prompt moves the status live) | Pass |
| 2 | A click opens the session in a terminal tab in the center | `e2e/src/m2-agents.spec.ts`: "a click on a session card opens its terminal in the center"; "a second click focuses the same terminal" | Pass |
| 3 | "New Session" creates a session in a chosen repository and opens it | `e2e/src/m2-agents.spec.ts`: "New Session creates a session in the picked repository and opens it" (the command palette, the repository pick, one more `OC ·` tab, and a larger group count) | Pass |
| 4 | A session that waits for a permission shows a notice and a badge | `e2e/src/m2-agents.spec.ts`: "a session that waits for a permission shows a notice and a badge", against a real, created permission request | Pass |
| 5 | A persistent terminal survives a close and a start of AI1 | `e2e/src/m2-agents-restart.spec.ts`: "a session tab and a persistent tab survive a restart correctly" (two full Electron starts, the same tmux session) | Pass |
| 6 | A closed AI1 kills no OpenCode session | The measurement of the packaged app: a probe session existed before and after a close of the packaged app (`opencode api GET /api/session`); same total count, the probe session present both times | Pass |
| 7 | Lint, type check, unit tests, and end-to-end tests pass | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` | Pass |

## Gate results

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, and `npm run test:e2e`, all from the repository root:

| Gate | Result |
|---|---|
| `format:check` | Clean |
| `lint` | Clean |
| `typecheck` | Clean (5 workspaces) |
| `test` | 262 passing (141 + 97 + 19 + 5), 0 failing |
| `build` | 0 errors (browser, node, electron) |
| `test:e2e` | 19 passed |
