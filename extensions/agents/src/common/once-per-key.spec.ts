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
});
