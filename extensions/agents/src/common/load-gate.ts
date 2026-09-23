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

// Runs `task` once, gated by `gate` (the caller has already called
// `gate.start()`; this is the part that runs after that). A `task` that
// throws does not skip the retry a joiner is owed: `retry` still runs
// when `gate.end()` says a request joined while `task` ran, and only once
// that retry has settled does this function throw `task`'s own error --
// never silently, and never in place of a more recent, more relevant
// failure: a `retry` that itself throws propagates its own error instead.
// `AgentsModel.load()` uses this with `retry` set to itself (`load()`
// again, so a retry re-arms `gate` through the same public entry point,
// exactly as a fresh, unrelated call would); it is a free function, not a
// method on `AgentsModel`, because that class pulls in `@theia/workspace`,
// which needs a DOM and so cannot be unit-tested in this project's plain
// Node mocha run -- this piece of the rule can be, and is, tested on its
// own here.
export async function runGatedOnce(
  gate: LoadGate,
  task: () => Promise<void>,
  retry: () => Promise<void>,
): Promise<void> {
  let again = false;
  let thrown: unknown;
  try {
    await task();
  } catch (error) {
    thrown = error;
  } finally {
    again = gate.end();
  }
  if (again) {
    await retry();
  }
  if (thrown !== undefined) {
    throw thrown;
  }
}
