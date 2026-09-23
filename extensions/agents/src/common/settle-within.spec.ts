import * as assert from "node:assert";
import { settleWithin } from "./settle-within";

describe("settleWithin", () => {
  it("resolves when the task resolves first", async () => {
    let done = false;
    await settleWithin(
      Promise.resolve().then(() => {
        done = true;
      }),
      1000,
    );
    assert.strictEqual(done, true);
  });

  it("resolves when the task rejects", async () => {
    await settleWithin(Promise.reject(new Error("the back end is gone")), 1000);
  });

  it("resolves after the time limit when the task never settles", async () => {
    const started = Date.now();
    await settleWithin(new Promise<void>(() => undefined), 50);
    assert.ok(Date.now() - started >= 45);
  });
});
