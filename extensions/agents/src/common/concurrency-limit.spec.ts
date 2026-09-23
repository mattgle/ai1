import * as assert from "node:assert";
import { mapLimit } from "./concurrency-limit";

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
