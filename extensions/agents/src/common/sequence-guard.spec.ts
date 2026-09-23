import * as assert from "node:assert";
import { isSnapshotStale } from "./sequence-guard";

describe("isSnapshotStale", () => {
  it("is stale when the last event sequence is newer than the load's starting sequence", () => {
    assert.strictEqual(isSnapshotStale(5, 3), true);
  });

  it("is not stale when the last event sequence is the same as the load's starting sequence", () => {
    assert.strictEqual(isSnapshotStale(3, 3), false);
  });

  it("is not stale when the last event sequence is older than the load's starting sequence", () => {
    assert.strictEqual(isSnapshotStale(2, 3), false);
  });

  it("is not stale when there is no event yet for the session", () => {
    assert.strictEqual(isSnapshotStale(undefined, 3), false);
  });
});
