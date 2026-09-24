import * as assert from "node:assert";
import {
  AGENT_PROFILE_ID,
  DEFAULT_PROFILE_ID,
  INITIAL_PROFILES,
  newProfileId,
  partitionFor,
  profileIdFromPartition,
  validateProfileName,
} from "./profiles";

describe("profiles", () => {
  it("starts with Default and Agent", () => {
    assert.deepStrictEqual(INITIAL_PROFILES, [
      { id: DEFAULT_PROFILE_ID, name: "Default" },
      { id: AGENT_PROFILE_ID, name: "Agent" },
    ]);
  });

  it("maps a profile id to a persistent partition and back", () => {
    assert.strictEqual(partitionFor("default"), "persist:ai1-browser-default");
    assert.strictEqual(profileIdFromPartition("persist:ai1-browser-default"), "default");
    assert.strictEqual(profileIdFromPartition("persist:ai1-browser-p-0a1b2c3d"), "p-0a1b2c3d");
  });

  it("gives no profile id for a partition that is not an AI1 profile", () => {
    for (const partition of [
      "",
      "persist:other",
      "ai1-browser-default",
      "persist:ai1-browser-",
      "persist:ai1-browser-../x",
    ]) {
      assert.strictEqual(profileIdFromPartition(partition), undefined, partition);
    }
  });

  it("makes a new id that is not in use", () => {
    const values = ["0a1b2c3d", "0a1b2c3d", "99887766"];
    const id = newProfileId(["p-0a1b2c3d"], () => values.shift()!);
    assert.strictEqual(id, "p-99887766");
  });

  it("refuses an empty, a too long, or a duplicate name", () => {
    assert.strictEqual(validateProfileName("Work", INITIAL_PROFILES), undefined);
    assert.ok(validateProfileName("  ", INITIAL_PROFILES));
    assert.ok(validateProfileName("x".repeat(41), INITIAL_PROFILES));
    assert.ok(validateProfileName("default", INITIAL_PROFILES));
  });

  it("allows a profile to keep its own name on a rename", () => {
    assert.strictEqual(validateProfileName("Agent", INITIAL_PROFILES, AGENT_PROFILE_ID), undefined);
  });
});
