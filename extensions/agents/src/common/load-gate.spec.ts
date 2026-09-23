import * as assert from "node:assert";
import { LoadGate, runGatedOnce } from "./load-gate";

describe("LoadGate", () => {
  it("lets the first load start", () => {
    const gate = new LoadGate();
    assert.strictEqual(gate.start(), true);
  });

  it("blocks a second start while the first load is in flight, and records it as dirty", () => {
    const gate = new LoadGate();
    gate.start();
    assert.strictEqual(gate.start(), false);
  });

  it("does not ask for another load when nothing happened while a load was in flight", () => {
    const gate = new LoadGate();
    gate.start();
    assert.strictEqual(gate.end(), false);
  });

  it("asks for another load when a start was blocked while a load was in flight", () => {
    const gate = new LoadGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
  });

  it("lets a new load start after the previous load ended", () => {
    const gate = new LoadGate();
    gate.start();
    gate.end();
    assert.strictEqual(gate.start(), true);
  });

  it("reports the dirty flag only once", () => {
    const gate = new LoadGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
    gate.start();
    assert.strictEqual(gate.end(), false);
  });

  it("still asks for one more load when several requests join the same in-flight load", () => {
    // Any number of joiners while one load is in flight must still cost at
    // most one extra load: `dirty` is a flag, not a counter.
    const gate = new LoadGate();
    gate.start();
    gate.start();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
    assert.strictEqual(gate.end(), false);
  });
});

describe("runGatedOnce", () => {
  it("gives the first caller (`own`) the task's own success", async () => {
    const gate = new LoadGate();
    gate.start();
    const { own } = runGatedOnce(
      gate,
      async () => undefined,
      async () => undefined,
    );
    await own;
  });

  it("gives the first caller (`own`) the task's own error, unchanged", async () => {
    const gate = new LoadGate();
    gate.start();
    const { own } = runGatedOnce(
      gate,
      async () => {
        throw new Error("task failed");
      },
      async () => undefined,
    );
    await assert.rejects(own, /task failed/);
  });

  it("does not call retry when nothing joined", async () => {
    const gate = new LoadGate();
    gate.start();
    let retryRuns = 0;
    const { own, retryChain } = runGatedOnce(
      gate,
      async () => undefined,
      async () => {
        retryRuns += 1;
      },
    );
    await own;
    await retryChain;
    assert.strictEqual(retryRuns, 0);
  });

  it("gives a joiner (`retryChain`) the task's own error too, when nothing joined", async () => {
    const gate = new LoadGate();
    gate.start();
    const { retryChain } = runGatedOnce(
      gate,
      async () => {
        throw new Error("task failed");
      },
      async () => undefined,
    );
    await assert.rejects(retryChain, /task failed/);
  });

  it("gives a joiner (`retryChain`) the retry's own success, even though the first call's own task failed", async () => {
    const gate = new LoadGate();
    gate.start();
    const { own, retryChain } = runGatedOnce(
      gate,
      async () => {
        // A joiner's own call, gated because `gate` is already running --
        // the same thing a real second `load()` call does.
        gate.start();
        throw new Error("task failed");
      },
      async () => undefined,
    );
    // The first caller still sees its own call's own failure...
    await assert.rejects(own, /task failed/);
    // ...but the joiner, who asked for a fresh load, is not stuck with
    // that unrelated, already-stale failure: it gets the retry's own
    // (successful) result instead.
    await retryChain;
  });

  it("gives a joiner (`retryChain`) the retry's own error, even though the first call's own task succeeded", async () => {
    const gate = new LoadGate();
    gate.start();
    const { own, retryChain } = runGatedOnce(
      gate,
      async () => {
        gate.start();
      },
      async () => {
        throw new Error("retry failed");
      },
    );
    await own;
    await assert.rejects(retryChain, /retry failed/);
  });

  it("still calls retry when the task throws, instead of skipping the joiner's own request", async () => {
    const gate = new LoadGate();
    gate.start();
    let retryRuns = 0;
    const { own } = runGatedOnce(
      gate,
      async () => {
        gate.start();
        throw new Error("task failed");
      },
      async () => {
        retryRuns += 1;
      },
    );
    await assert.rejects(own, /task failed/);
    assert.strictEqual(retryRuns, 1);
  });

  it("treats a task that rejects with undefined as a failure, not a success", async () => {
    // The regression this guards against: checking a captured rejection
    // reason for `!== undefined` treats `undefined` itself as "no error",
    // silently swallowing a task that fails with no reason at all. A
    // plain boolean, set in the `catch`, cannot make that mistake.
    const gate = new LoadGate();
    gate.start();
    const task = (): Promise<void> => Promise.reject(undefined);
    const { own, retryChain } = runGatedOnce(gate, task, async () => undefined);
    await assert.rejects(own);
    await assert.rejects(retryChain);
  });
});
