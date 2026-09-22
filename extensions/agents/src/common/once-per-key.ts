// Runs an async task at most one time per key: a second call while the task
// is in flight, or after it has succeeded, does nothing. A task that fails
// does not keep its key, so a later call tries again; the error is dropped.
// `forget` re-arms a key, for a caller that has its own reason to want the
// task to run again.
export class OncePerKey {
  protected readonly inFlight = new Set<string>();
  protected readonly done = new Set<string>();

  run(key: string, task: () => Promise<void>): boolean {
    if (this.done.has(key) || this.inFlight.has(key)) {
      return false;
    }
    this.inFlight.add(key);
    void task()
      .then(
        () => {
          this.done.add(key);
        },
        () => undefined,
      )
      .finally(() => {
        this.inFlight.delete(key);
      });
    return true;
  }

  forget(key: string): void {
    this.inFlight.delete(key);
    this.done.delete(key);
  }
}
