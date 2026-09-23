// Runs an async task at most one time per key: a second call while the task
// is in flight, or after it has succeeded, does nothing. A task that fails
// does not keep its key, so a later call tries again; the error is dropped.
// `forget` re-arms a key, for a caller that has its own reason to want the
// task to run again.
//
// Each key has its own generation counter, bumped by `forget`. `task`
// receives `stillCurrent`, a function a caller can call after its own
// `await` to tell whether `forget` ran for this key in the meantime: a
// request that was already in flight when `forget` ran is from an earlier
// generation, and must not store its answer as if it were a fresh one (the
// caller checks `stillCurrent()` itself before it keeps the result; this
// class only tracks the generation, it does not know what a caller's own
// "store the answer" means).
export class OncePerKey {
  protected readonly inFlight = new Set<string>();
  protected readonly done = new Set<string>();
  protected readonly generation = new Map<string, number>();

  run(key: string, task: (stillCurrent: () => boolean) => Promise<void>): boolean {
    if (this.done.has(key) || this.inFlight.has(key)) {
      return false;
    }
    this.inFlight.add(key);
    const startedAtGeneration = this.generation.get(key) ?? 0;
    const stillCurrent = (): boolean => (this.generation.get(key) ?? 0) === startedAtGeneration;
    void task(stillCurrent)
      .then(
        () => {
          if (stillCurrent()) {
            this.done.add(key);
          }
        },
        () => undefined,
      )
      .finally(() => {
        // A stale task's own `finally` must not clear `inFlight` for a
        // newer task of the same key: without this check, an old task
        // that is still running when `forget` starts a second `run` for
        // the same key clears `inFlight` when it eventually settles, even
        // though the second task is still in flight -- letting a third
        // `run` wrongly start a third task for the same key at once.
        if (stillCurrent()) {
          this.inFlight.delete(key);
        }
      });
    return true;
  }

  forget(key: string): void {
    this.inFlight.delete(key);
    this.done.delete(key);
    this.generation.set(key, (this.generation.get(key) ?? 0) + 1);
  }
}
