// Playwright gives the environment of the runner to the global teardown,
// which uses this time to look only at the processes that the suite started.
export default function globalSetup(): void {
  process.env.AI1_E2E_SUITE_START_MS = String(Date.now());
}
