import * as assert from "node:assert";
import { badgeDecorations } from "./badge-decoration";

describe("badgeDecorations", () => {
  it("gives an empty list for zero blocked sessions", () => {
    assert.deepStrictEqual(badgeDecorations(0), []);
  });

  it("gives one badge decoration with the blocked count", () => {
    assert.deepStrictEqual(badgeDecorations(3), [{ badge: 3 }]);
  });
});
