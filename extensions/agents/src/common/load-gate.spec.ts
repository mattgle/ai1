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
  it("runs the task once and resolves when nothing else asked for a retry", async () => {
    const gate = new LoadGate();
    gate.start();
    let taskRuns = 0;
    let retryRuns = 0;
    await runGatedOnce(
      gate,
      async () => {
        taskRuns += 1;
      },
      async () => {
        retryRuns += 1;
      },
    );
    assert.strictEqual(taskRuns, 1);
    assert.strictEqual(retryRuns, 0);
  });

  it("calls retry once when a request joined while the task ran, and resolves when both succeed", async () => {
    const gate = new LoadGate();
    gate.start();
    let retryRuns = 0;
    await runGatedOnce(
      gate,
      async () => {
        // A joiner's own call, gated because `gate` is already running --
        // the same thing a real second `load()` call does.
        gate.start();
      },
      async () => {
        retryRuns += 1;
      },
    );
    assert.strictEqual(retryRuns, 1);
  });

  it("still calls retry when the task throws, instead of skipping the joiner's own request", async () => {
    const gate = new LoadGate();
    gate.start();
    let retryRuns = 0;
    await assert.rejects(
      runGatedOnce(
        gate,
        async () => {
          gate.start();
          throw new Error("task failed");
        },
        async () => {
          retryRuns += 1;
        },
      ),
      /task failed/,
    );
    assert.strictEqual(retryRuns, 1);
  });

  it("rethrows the task's own error even after a successful retry, so it is never silently dropped", async () => {
    const gate = new LoadGate();
    gate.start();
    await assert.rejects(
      runGatedOnce(
        gate,
        async () => {
          gate.start();
          throw new Error("task failed");
        },
        async () => {
          // succeeds
        },
      ),
      /task failed/,
    );
  });

  it("rethrows the task's own error when nothing joined, and never calls retry", async () => {
    const gate = new LoadGate();
    gate.start();
    await assert.rejects(
      runGatedOnce(
        gate,
        async () => {
          throw new Error("task failed");
        },
        async () => {
          throw new Error("must not run");
        },
      ),
      /task failed/,
    );
  });

  it("lets the retry's own error take the place of the task's error", async () => {
    const gate = new LoadGate();
    gate.start();
    await assert.rejects(
      runGatedOnce(
        gate,
        async () => {
          gate.start();
          throw new Error("task failed");
        },
        async () => {
          throw new Error("retry failed");
        },
      ),
      /retry failed/,
    );
  });
});
