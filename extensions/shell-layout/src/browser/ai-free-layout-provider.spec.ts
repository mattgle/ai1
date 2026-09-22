import * as assert from "node:assert";
import { DEFAULT_LAYOUT } from "@theia/preferences/lib/browser/util/preference-layout";
import { AiFreeLayoutProvider } from "./ai-free-layout-provider";

describe("AiFreeLayoutProvider", () => {
  it("leaves out the AI Features entry", () => {
    const layout = new AiFreeLayoutProvider().getLayout();
    assert.ok(!layout.some((section) => section.id === "ai-features"));
  });

  it("keeps every other entry of the default layout", () => {
    const layout = new AiFreeLayoutProvider().getLayout();
    const expectedIds = DEFAULT_LAYOUT.filter((section) => section.id !== "ai-features").map(
      (section) => section.id,
    );
    assert.deepStrictEqual(
      layout.map((section) => section.id),
      expectedIds,
    );
  });
});
