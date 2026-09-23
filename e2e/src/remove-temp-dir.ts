import * as fs from "node:fs";

// Removes a temporary directory, retrying until it is actually gone.
// Electron's own user-data folder can still have a background write in
// flight for a moment after the app process closes -- not just its
// leveldb-backed local storage and caches, but background helper processes
// (for example the GPU process) that can outlive the main process past when
// Playwright's own `close()` resolves, holding a lock or socket file open.
// A single `fs.rmSync` call can throw ENOTEMPTY (not suppressed by `force`,
// which only covers a path that does not exist), or can return without
// throwing while a straggler file that appeared mid-walk is still there.
// Checking existence after each attempt, not only whether `rmSync` threw,
// catches both.
export async function removeTempDir(dir: string, attempts = 20, delayMs = 300): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // retried below
    }
    if (!fs.existsSync(dir)) {
      // A background Electron helper process (for example the GPU process)
      // can still be a beat behind the main process closing, and write one
      // more file into this exact path right after it looked gone. Settle
      // for a moment and check again before declaring success.
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (!fs.existsSync(dir)) {
        return;
      }
      continue;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`could not remove '${dir}' after ${attempts} attempts`);
}
