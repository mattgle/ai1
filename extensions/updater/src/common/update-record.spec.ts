import * as assert from "node:assert";
import { compareVersions, isCheckDue, updateSummary } from "./update-record";

describe("update record helpers", () => {
  it("compares dotted versions and letter suffixes", () => {
    assert.equal(compareVersions("v2.0.9", "2.0.10"), -1);
    assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.10"), -1);
    assert.equal(compareVersions("3.5a", "3.5b"), -1);
    assert.equal(compareVersions("3.5a", "3.5"), -1);
    assert.equal(compareVersions("3.5", "3.5"), 0);
    assert.equal(compareVersions("3.5.0", "3.5"), 0);
  });

  it("returns no comparison for invalid versions", () => {
    assert.equal(compareVersions("unknown", "2.0"), undefined);
    assert.equal(compareVersions("2.0", "not a version"), undefined);
  });

  it("checks immediately when there is no valid recent timestamp", () => {
    const interval = 24 * 60 * 60 * 1000;
    assert.equal(isCheckDue(undefined, 100_000, interval), true);
    assert.equal(isCheckDue(Number.NaN, 100_000, interval), true);
    assert.equal(isCheckDue(100_000, 100_000 + interval - 1, interval), false);
    assert.equal(isCheckDue(100_000, 100_000 + interval, interval), true);
  });

  it("summarizes update, current, and failed checks", () => {
    assert.equal(
      updateSummary({
        checkedAt: 0,
        records: [
          {
            id: "tmux",
            name: "tmux",
            source: "homebrew",
            current: "3.5a",
            available: "3.6",
            updateAvailable: true,
            canApply: true,
          },
          {
            id: "ai1",
            name: "AI1",
            source: "git",
            updateAvailable: false,
            canApply: false,
            error: "the update check failed.",
          },
        ],
      }),
      "tmux: Update available (3.5a → 3.6).\nAI1: the update check failed.",
    );
  });
});
