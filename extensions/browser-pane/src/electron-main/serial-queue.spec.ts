import * as assert from "node:assert";
import { SerialQueue } from "./serial-queue";

describe("SerialQueue", () => {
  it("runs a second task only after the first task settles", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = queue.run(async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => (releaseFirst = resolve));
      order.push("first-end");
    });
    const second = queue.run(async () => {
      order.push("second-start");
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(order, ["first-start"]);
    releaseFirst();
    await first;
    await second;
    assert.deepStrictEqual(order, ["first-start", "first-end", "second-start"]);
  });

  it("runs the next task after a rejected task, and gives each task its own result", async () => {
    const queue = new SerialQueue();
    const first = queue.run(async () => {
      throw new Error("boom");
    });
    const second = queue.run(async () => "ok");
    await assert.rejects(first, /boom/);
    assert.strictEqual(await second, "ok");
  });

  it("runs three tasks in the order they were added", async () => {
    const queue = new SerialQueue();
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      queue.run(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        order.push(n);
      }),
    );
    await Promise.all(tasks);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });
});
