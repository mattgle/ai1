import * as assert from "node:assert";
import { dayLabel, shouldRecord } from "./history";
import { AGENT_PROFILE_ID, DEFAULT_PROFILE_ID } from "./profiles";

describe("shouldRecord", () => {
  it("is true for http and https pages of a normal profile", () => {
    assert.strictEqual(shouldRecord("http://127.0.0.1:3000/a", DEFAULT_PROFILE_ID), true);
    assert.strictEqual(shouldRecord("https://example.com/", DEFAULT_PROFILE_ID), true);
    assert.strictEqual(shouldRecord("https://example.com/", "p-1234abcd"), true);
  });

  it("is false for other schemes", () => {
    for (const url of [
      "about:blank",
      "data:text/html,<p>error</p>",
      "file:///etc/hosts",
      "chrome://gpu",
      "not an address",
      "",
    ]) {
      assert.strictEqual(shouldRecord(url, DEFAULT_PROFILE_ID), false, url);
    }
  });

  it("is false for the Agent profile", () => {
    assert.strictEqual(shouldRecord("https://example.com/", AGENT_PROFILE_ID), false);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 8, 25, 12, 0, 0).getTime();

  it("gives Today from the start of today to now", () => {
    assert.strictEqual(dayLabel(new Date(2026, 8, 25, 0, 0, 0).getTime(), now), "Today");
    assert.strictEqual(dayLabel(now, now), "Today");
    assert.strictEqual(dayLabel(new Date(2026, 8, 25, 23, 59, 59).getTime(), now), "Today");
  });

  it("gives Yesterday for all of the day before", () => {
    assert.strictEqual(dayLabel(new Date(2026, 8, 24, 23, 59, 59, 999).getTime(), now), "Yesterday");
    assert.strictEqual(dayLabel(new Date(2026, 8, 24, 0, 0, 0).getTime(), now), "Yesterday");
  });

  it("gives the date for an earlier day", () => {
    assert.strictEqual(dayLabel(new Date(2026, 8, 23, 23, 59, 59, 999).getTime(), now), "Sep 23, 2026");
    assert.strictEqual(dayLabel(new Date(2025, 11, 31, 8, 0, 0).getTime(), now), "Dec 31, 2025");
  });

  it("gives Yesterday across the start of a month and a year", () => {
    const newYear = new Date(2027, 0, 1, 0, 0, 1).getTime();
    assert.strictEqual(dayLabel(new Date(2026, 11, 31, 23, 0, 0).getTime(), newYear), "Yesterday");
    assert.strictEqual(dayLabel(new Date(2026, 11, 30, 23, 0, 0).getTime(), newYear), "Dec 30, 2026");
  });
});
