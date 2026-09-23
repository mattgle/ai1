// Gates a refresh that a burst of file events can ask for many times in a
// short time. Only one scan runs at a time. A request that arrives while a
// scan is in flight does not start its own scan; it only marks that one more
// scan must run once the current one ends.
export class RefreshGate {
  private running = false;
  private dirty = false;

  // Call before a scan starts. Returns true when the scan may start now.
  // Returns false when a scan is already in flight; the caller must not
  // start a scan, and this call records that one more scan is needed.
  start(): boolean {
    if (this.running) {
      this.dirty = true;
      return false;
    }
    this.running = true;
    return true;
  }

  // Call after a scan ends. Returns true when a request arrived while the
  // scan was running, so the caller must start one more scan.
  end(): boolean {
    this.running = false;
    const runAgain = this.dirty;
    this.dirty = false;
    return runAgain;
  }
}
