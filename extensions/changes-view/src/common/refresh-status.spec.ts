import * as assert from "node:assert/strict";
import { RefreshStatus } from "./refresh-status";

describe("Changes refresh status", () => {
  it("starts without a successful snapshot", () => {
    const status = new RefreshStatus();
    assert.equal(status.lastSuccess, undefined);
    assert.equal(status.stale, true);
  });

  it("records the successful refresh time and duration", () => {
    const status = new RefreshStatus();
    status.start(1000);
    assert.equal(status.refreshing, true);
    status.succeed(1250);
    assert.equal(status.refreshing, false);
    assert.equal(status.lastSuccess, 1250);
    assert.equal(status.durationMs, 250);
    assert.equal(status.stale, false);
  });

  it("keeps the last successful time after a failed refresh", () => {
    const status = new RefreshStatus();
    status.start(1000);
    status.succeed(1250);
    status.start(2000);
    status.fail("Git is not available.");
    assert.equal(status.lastSuccess, 1250);
    assert.equal(status.refreshing, false);
    assert.equal(status.stale, true);
    assert.equal(status.error, "Git is not available.");
  });

  it("does not clear file events that arrive during a scan", () => {
    const status = new RefreshStatus();
    status.start(1000);
    status.invalidate();
    status.succeed(1250);
    assert.equal(status.stale, true);
    status.start(2000);
    status.succeed(2100);
    assert.equal(status.stale, false);
  });
});
