import * as assert from "node:assert";
import { cardThirdLine, oneLine, reconnectingPrefix, relativeAge } from "./card-text";

describe("relativeAge", () => {
  const now = 1_000_000_000_000;

  it("gives seconds, minutes, hours, and days", () => {
    assert.strictEqual(relativeAge(now - 5_000, now), "5s ago");
    assert.strictEqual(relativeAge(now - 3 * 60_000, now), "3m ago");
    assert.strictEqual(relativeAge(now - 2 * 3_600_000, now), "2h ago");
    assert.strictEqual(relativeAge(now - 6 * 86_400_000, now), "6d ago");
  });

  it("never goes negative", () => {
    assert.strictEqual(relativeAge(now + 5_000, now), "0s ago");
  });
});

describe("cardThirdLine", () => {
  it("joins the counter, the age, and the model with dots", () => {
    const now = 1_000_000_000_000;
    assert.strictEqual(
      cardThirdLine(155, now - 6 * 86_400_000, "claude-x", now),
      "155 msgs · 6d ago · claude-x",
    );
  });
});

describe("oneLine", () => {
  it("collapses whitespace and cuts at the limit with an ellipsis", () => {
    assert.strictEqual(oneLine("a\n\n  b   c", 100), "a b c");
    assert.strictEqual(oneLine("0123456789", 5), "0123…");
  });
});

describe("reconnectingPrefix", () => {
  it("gives an empty string when connected", () => {
    assert.strictEqual(reconnectingPrefix(true), "");
  });

  it("gives the reconnecting text when not connected, shared by the summary line and the empty state", () => {
    assert.strictEqual(reconnectingPrefix(false), "Reconnecting… ");
  });
});
