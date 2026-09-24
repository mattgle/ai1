// Runs async tasks one at a time, in the order `run` is called. A task
// starts only after the previous task's promise has settled (fulfilled or
// rejected), so two quick calls never run their bodies at the same time.
export class SerialQueue {
  protected tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const started = this.tail.then(task);
    this.tail = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  }
}
