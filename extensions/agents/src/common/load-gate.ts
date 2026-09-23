// Gates a load that a reconnect, a command, or the widget's own start can
// each ask for while one is already in flight. A request that arrives
// while a load is running does not start its own load; it only marks that
// one more load must run once the current one ends, so that request still
// gets a snapshot that started at or after its own call, not the stale one
// the running load began before it.
//
// This is the same rule as `RefreshGate`
// (extensions/changes-view/src/common/refresh-gate.ts), copied here
// rather than imported: no extension in this project depends on another.
export class LoadGate {
  private running = false;
  private dirty = false;

  // Call before a load starts. Returns true when the load may start now.
  // Returns false when a load is already in flight; the caller must not
  // start a load, and this call records that one more load is needed.
  start(): boolean {
    if (this.running) {
      this.dirty = true;
      return false;
    }
    this.running = true;
    return true;
  }

  // Call after a load ends. Returns true when a request arrived while the
  // load was running, so the caller must start one more load.
  end(): boolean {
    this.running = false;
    const runAgain = this.dirty;
    this.dirty = false;
    return runAgain;
  }
}
