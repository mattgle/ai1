import * as assert from "node:assert";
import { UpdateReport } from "../common/update-record";
import { UpdateCheckStateStore } from "./update-check-state";
import {
  UpdateCheckScheduler,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_RETRY_INTERVAL_MS,
} from "./update-check-scheduler";

function report(checkedAt: number, error?: string): UpdateReport {
  return {
    checkedAt,
    records: error
      ? [{ id: "source", name: "Source", source: "git", updateAvailable: false, canApply: false, error }]
      : [
          {
            id: "source",
            name: "Source",
            source: "git",
            current: "1.0.0",
            available: "1.0.0",
            updateAvailable: false,
            canApply: false,
          },
        ],
  };
}

describe("UpdateCheckScheduler", () => {
  let now: number;
  let storedAt: number | undefined;
  let callbacks: (() => void)[];
  let delays: number[];
  let notified: UpdateReport[];
  let check: () => Promise<UpdateReport>;
  let scheduler: UpdateCheckScheduler;

  beforeEach(() => {
    now = 1000;
    storedAt = undefined;
    callbacks = [];
    delays = [];
    notified = [];
    check = async () => report(now);
    const store = {
      read: () => (storedAt === undefined ? {} : { lastCompletedCheckAt: storedAt }),
      write: (state: { lastCompletedCheckAt?: number }) => {
        storedAt = state.lastCompletedCheckAt;
      },
    } as UpdateCheckStateStore;
    scheduler = new UpdateCheckScheduler({
      store,
      check: () => check(),
      notify: (value) => notified.push(value),
      now: () => now,
      schedule: (callback, delay) => {
        callbacks.push(callback);
        delays.push(delay);
        return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => undefined,
    });
  });

  it("checks at startup when there is no persisted completion", async () => {
    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(storedAt, now);
    assert.equal(delays.at(-1), UPDATE_CHECK_INTERVAL_MS);
  });

  it("waits for the remaining interval after restart", () => {
    storedAt = now - 23 * 60 * 60 * 1000;
    scheduler.start();
    assert.equal(delays[0], 60 * 60 * 1000);
  });

  it("does not persist failed automatic checks and schedules an earlier retry", async () => {
    check = async () => report(now, "offline");
    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(storedAt, undefined);
    assert.equal(delays.at(-1), UPDATE_CHECK_RETRY_INTERVAL_MS);
    assert.equal(notified.length, 1);
  });

  it("does not persist a rejected automatic check", async () => {
    check = async () => {
      throw new Error("local path or network detail");
    };
    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(storedAt, undefined);
    assert.equal(delays.at(-1), UPDATE_CHECK_RETRY_INTERVAL_MS);
    assert.equal(notified[0].records[0].error, "AI1 could not complete the update check.");
  });

  it("runs only one check when manual and scheduled callers overlap", async () => {
    let resolveCheck!: (value: UpdateReport) => void;
    let calls = 0;
    check = () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveCheck = resolve;
      });
    };
    const manual = scheduler.checkNow();
    const joined = scheduler.checkNow();
    assert.equal(calls, 1);
    resolveCheck(report(now));
    assert.deepStrictEqual(await manual, await joined);
    assert.equal(storedAt, now);
  });

  it("stops its timer when the Electron main process stops", () => {
    storedAt = now;
    scheduler.start();
    assert.equal(callbacks.length, 1);
    scheduler.stop();
  });
});
