import * as assert from "node:assert";
import { PreferenceScope } from "@theia/core/lib/common/preferences/preference-scope";
import { userPreference } from "./user-preference";

function preferences(values: Partial<Record<PreferenceScope, unknown>>) {
  return {
    inspectInScope: (_name: string, scope: PreferenceScope) => values[scope],
  };
}

describe("userPreference", () => {
  it("does not use a value from the workspace or folder settings of a repository", () => {
    const repository = preferences({ [PreferenceScope.Workspace]: true, [PreferenceScope.Folder]: true });
    assert.strictEqual(userPreference(repository, "ai1.browser.agentAddress.enabled", false), false);
  });

  it("uses the value from the user settings", () => {
    const user = preferences({ [PreferenceScope.User]: true, [PreferenceScope.Workspace]: false });
    assert.strictEqual(userPreference(user, "ai1.browser.agentAddress.enabled", false), true);
  });

  it("uses the fallback when the user value has a wrong type", () => {
    const wrong = preferences({ [PreferenceScope.User]: "yes" });
    assert.strictEqual(userPreference(wrong, "ai1.browser.agentAddress.enabled", false), false);
  });
});
