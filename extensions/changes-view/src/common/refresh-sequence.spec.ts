import * as assert from "node:assert";
import { RefreshSequence } from "./refresh-sequence";

describe("RefreshSequence", () => {
  it("gives the token of one started refresh as the latest", () => {
    const sequence = new RefreshSequence();
    const token = sequence.start();
    assert.strictEqual(sequence.isLatest(token), true);
  });

  it("makes the first token stale and the second token latest, after a second start", () => {
    const sequence = new RefreshSequence();
    const first = sequence.start();
    const second = sequence.start();
    assert.strictEqual(sequence.isLatest(first), false);
    assert.strictEqual(sequence.isLatest(second), true);
  });
});
