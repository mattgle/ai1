import * as assert from "node:assert";
import { decideLinkTarget } from "./link-choice";

describe("decideLinkTarget", () => {
  it("follows the setting without Shift", () => {
    assert.strictEqual(decideLinkTarget("ai1", false), "ai1");
    assert.strictEqual(decideLinkTarget("system", false), "system");
    assert.strictEqual(decideLinkTarget("ask", false), "ask");
  });

  it("opens the other browser with Shift", () => {
    assert.strictEqual(decideLinkTarget("ai1", true), "system");
    assert.strictEqual(decideLinkTarget("system", true), "ai1");
  });

  it("still asks with Shift when there is no choice yet", () => {
    assert.strictEqual(decideLinkTarget("ask", true), "ask");
  });
});
