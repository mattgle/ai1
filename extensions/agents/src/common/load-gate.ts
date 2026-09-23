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

// The two promises `runGatedOnce` hands back: `own` for the caller whose
// own `gate.start()` call started `task`, `retryChain` for a caller whose
// own `gate.start()` call returned false instead (a joiner) and so is
// given this in its place. They can settle differently: the first
// caller's own request genuinely ran `task` and gets exactly what it did,
// success or failure; a joiner's own request is what makes a retry run at
// all, so it gets that retry's own result instead -- a joiner must not be
// stuck with an unrelated failure from a `task` run it never asked to
// wait for, and must not be told a fresh load succeeded when its own
// retry actually failed.
export interface GatedRun {
  own: Promise<void>;
  retryChain: Promise<void>;
}

// Runs `task` once, gated by `gate` (the caller has already called
// `gate.start()`; this is the part that runs after that), and returns at
// once -- `task` itself may still be pending. `AgentsModel.load()` uses
// this with `retry` set to itself (`load()` again, so a retry re-arms
// `gate` through the same public entry point, exactly as a fresh,
// unrelated call would); it is a free function, not a method on
// `AgentsModel`, because that class pulls in `@theia/workspace`, which
// needs a DOM and so cannot be unit-tested in this project's plain Node
// mocha run -- this piece of the rule can be, and is, tested on its own
// here.
export function runGatedOnce(
  gate: LoadGate,
  task: () => Promise<void>,
  retry: () => Promise<void>,
): GatedRun {
  const own = task();
  const retryChain = followUp(gate, own, retry);
  // A real joiner reads `retryChain` off this function's own return value
  // and attaches its own handler to it independently, which still sees
  // the real settlement no matter how many other handlers exist on the
  // same promise. This one only keeps a `retryChain` nobody ever asks for
  // (`task` failed alone, with no joiner) from being reported as an
  // unhandled rejection on its own.
  retryChain.catch(() => undefined);
  return { own, retryChain };
}

// `retryChain`'s own rule, once `own` (`task`'s own promise) settles: a
// joined request (`gate.end()` says so) always gets `retry`'s own result,
// whether `task` itself failed or not; with no joiner, it gets exactly
// what `task` got. `failed` is a plain boolean set in the `catch` below,
// not a check of the caught value itself (`thrown !== undefined` would
// wrongly treat a `task` that rejects with no reason at all, `undefined`
// itself, as a success).
async function followUp(gate: LoadGate, own: Promise<void>, retry: () => Promise<void>): Promise<void> {
  let failed = false;
  try {
    await own;
  } catch {
    failed = true;
  }
  if (gate.end()) {
    return retry();
  }
  if (failed) {
    // Adopts `own`'s own rejection again (whatever it is, including
    // `undefined`): returning a rejected promise from an async function
    // makes this function's own promise reject with that same reason.
    return own;
  }
}
