import * as assert from "node:assert";
import { mapLimit, mapLimitUntilFatal } from "./concurrency-limit";

describe("mapLimit", () => {
  it("gives the results in the same order as the items, even when tasks settle out of order", async () => {
    const delays = [30, 10, 20];
    const results = await mapLimit(
      delays,
      4,
      (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
    );
    assert.deepStrictEqual(results, delays);
  });

  it("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapLimit(items, 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item;
    });
    assert.ok(maxInFlight <= 3, `expected at most 3 in flight, saw ${maxInFlight}`);
  });

  it("runs every item when the limit is at least the item count", async () => {
    const items = [1, 2, 3];
    const results = await mapLimit(items, 10, async (item) => item * 2);
    assert.deepStrictEqual(results, [2, 4, 6]);
  });

  it("gives an empty list for an empty input", async () => {
    const results = await mapLimit([], 4, async (item: number) => item);
    assert.deepStrictEqual(results, []);
  });

  it("propagates a task's rejection", async () => {
    await assert.rejects(
      mapLimit([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error("boom");
        }
        return item;
      }),
      /boom/,
    );
  });
});

describe("mapLimitUntilFatal", () => {
  it("runs every item and gives the task's own result when nothing is fatal", async () => {
    const results = await mapLimitUntilFatal(
      [1, 2, 3, 4, 5],
      2,
      async (item) => item * 2,
      () => false,
      () => -1,
    );
    assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
  });

  it("gives the fallback for an item whose task rejects, without stopping the others, when the error is not fatal", async () => {
    const started: number[] = [];
    const results = await mapLimitUntilFatal(
      [1, 2, 3, 4],
      2,
      async (item) => {
        started.push(item);
        if (item === 2) {
          throw new Error("an ordinary per-item error");
        }
        return item * 10;
      },
      () => false, // nothing is ever fatal in this test
      () => -1,
    );
    assert.deepStrictEqual(results, [10, -1, 30, 40]);
    assert.deepStrictEqual(
      [...started].sort((a, b) => a - b),
      [1, 2, 3, 4],
      "a non-fatal error must not stop later items from starting",
    );
  });

  it("stops starting new tasks once a fatal error settles, and gives every not-yet-started item the fallback with no call to task at all", async () => {
    const started: number[] = [];
    // limit 2: items 0 and 1 start together. Item 1's task rejects fast,
    // with an error `isFatal` matches; item 0's task is slower, still in
    // flight at that moment. Items 2-5 must never start at all.
    const results = await mapLimitUntilFatal(
      [0, 1, 2, 3, 4, 5],
      2,
      async (item) => {
        started.push(item);
        if (item === 1) {
          throw new Error("fatal");
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
        return item * 100;
      },
      (error) => error instanceof Error && error.message === "fatal",
      () => -1,
    );
    // Item 0 was already in flight when the stop happened: it still runs
    // to its own, real completion, not the fallback.
    assert.deepStrictEqual(results, [0, -1, -1, -1, -1, -1]);
    assert.deepStrictEqual(
      [...started].sort((a, b) => a - b),
      [0, 1],
      "no item past the fatal one may ever start",
    );
  });

  it("never runs more than the limit at once before a fatal error", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapLimitUntilFatal(
      items,
      3,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return item;
      },
      () => false,
      () => -1,
    );
    assert.ok(maxInFlight <= 3, `expected at most 3 in flight, saw ${maxInFlight}`);
  });

  it("gives the results in the same order as the items, mixing task results and fallbacks", async () => {
    const results = await mapLimitUntilFatal(
      [10, 20, 30],
      3,
      (item) => new Promise<number>((resolve) => setTimeout(() => resolve(item), 30 - item)),
      () => false,
      () => -1,
    );
    assert.deepStrictEqual(results, [10, 20, 30]);
  });

  it("gives an empty list for an empty input", async () => {
    const results = await mapLimitUntilFatal(
      [],
      4,
      async (item: number) => item,
      () => false,
      () => -1,
    );
    assert.deepStrictEqual(results, []);
  });

  it("does not skip anything when every item already started before the fatal error settles", async () => {
    // limit >= items.length: everything starts at once, so there is
    // nothing left to skip when the fatal error fires.
    const results = await mapLimitUntilFatal(
      [1, 2, 3],
      10,
      async (item) => {
        if (item === 2) {
          throw new Error("fatal");
        }
        return item * 10;
      },
      (error) => error instanceof Error && error.message === "fatal",
      () => -1,
    );
    assert.deepStrictEqual(results, [10, -1, 30]);
  });
});
