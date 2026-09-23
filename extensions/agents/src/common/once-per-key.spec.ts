import * as assert from "node:assert";
import { OncePerKey } from "./once-per-key";

describe("OncePerKey", () => {
  it("runs the task once for a key", async () => {
    const once = new OncePerKey();
    let calls = 0;
    const started = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(started, true);
    assert.strictEqual(calls, 1);
  });

  it("does nothing for a second call while the task is in flight", async () => {
    const once = new OncePerKey();
    let calls = 0;
    let resolveFirst: (() => void) | undefined;
    const first = once.run("a", () => {
      calls += 1;
      return new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const second = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(first, true);
    assert.strictEqual(second, false);
    assert.strictEqual(calls, 1);
    resolveFirst?.();
  });

  it("keeps the key done after the task settles, so a later call does nothing", async () => {
    const once = new OncePerKey();
    let calls = 0;
    once.run("a", async () => {
      calls += 1;
    });
    // Let the microtask queue drain, so the task's `finally` has run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(later, false);
    assert.strictEqual(calls, 1);
  });

  it("does not keep the key done after the task fails, so a later call runs it again", async () => {
    const once = new OncePerKey();
    let calls = 0;
    once.run("a", async () => {
      calls += 1;
      throw new Error("the request failed");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(later, true);
    assert.strictEqual(calls, 2);
  });

  it("forgets a key, so a later call runs the task again", async () => {
    const once = new OncePerKey();
    let calls = 0;
    once.run("a", async () => {
      calls += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    once.forget("a");
    const started = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(started, true);
    assert.strictEqual(calls, 2);
  });

  it("tells a task in flight, through stillCurrent, that forget ran while it awaited", async () => {
    const once = new OncePerKey();
    let resolveFirst: (() => void) | undefined;
    let firstStillCurrentAfterAwait: boolean | undefined;
    once.run("a", async (stillCurrent) => {
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      firstStillCurrentAfterAwait = stillCurrent();
    });
    // A caller with its own reason to want a fresh answer (the M5 case: a
    // session's status moved to done or failed) forgets the key while the
    // first task is still in flight.
    once.forget("a");
    resolveFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(firstStillCurrentAfterAwait, false);
  });

  it("does not mark a key done from a stale task that finishes after forget ran", async () => {
    const once = new OncePerKey();
    let resolveFirst: (() => void) | undefined;
    once.run("a", async () => {
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    once.forget("a");
    resolveFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The stale task's own completion must not re-mark "a" done: a call
    // right after must still be free to start a fresh task.
    let calls = 0;
    const started = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(started, true);
    assert.strictEqual(calls, 1);
  });

  it("keeps a second run in flight after a stale first run (forgotten, then settling late) finishes", async () => {
    const once = new OncePerKey();
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    let calls = 0;
    once.run("a", () => {
      calls += 1;
      return new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    once.forget("a");
    once.run("a", () => {
      calls += 1;
      return new Promise<void>((resolve) => {
        resolveSecond = resolve;
      });
    });
    // The first (now stale) task settles while the second is still
    // running: its own `finally` must not clear `inFlight` for the
    // second, still-running task.
    resolveFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = once.run("a", async () => {
      calls += 1;
    });
    assert.strictEqual(third, false);
    assert.strictEqual(calls, 2);
    resolveSecond?.();
  });

  it("reports stillCurrent as true when no forget ran while the task was in flight", async () => {
    const once = new OncePerKey();
    let seen: boolean | undefined;
    once.run("a", async (stillCurrent) => {
      seen = stillCurrent();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(seen, true);
  });
});
