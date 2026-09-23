import * as assert from "node:assert";
import { sessionBadge } from "./badge-decoration";

describe("sessionBadge", () => {
  it("gives undefined for zero blocked sessions", () => {
    assert.strictEqual(sessionBadge(0), undefined);
  });

  it("gives the count and a singular tooltip for one blocked session", () => {
    assert.deepStrictEqual(sessionBadge(1), { value: 1, tooltip: "1 blocked session" });
  });

  it("gives the count and a plural tooltip for more than one blocked session", () => {
    assert.deepStrictEqual(sessionBadge(3), { value: 3, tooltip: "3 blocked sessions" });
  });
});
