import * as assert from "node:assert";
import { AI_FEATURES_OFF } from "./ai-features-off-state";

describe("AI_FEATURES_OFF", () => {
  it("reports that the AI features are not active and cannot run", () => {
    assert.deepStrictEqual(AI_FEATURES_OFF, { isActive: false, canRun: false });
  });
});
