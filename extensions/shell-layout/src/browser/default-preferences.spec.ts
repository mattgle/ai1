import * as assert from "node:assert";
import { DEFAULT_PREFERENCES, PreferenceState, selectUnsetDefaults } from "./default-preferences";

const state = (known: boolean, setByUser: boolean): PreferenceState => ({ known, setByUser });

describe("selectUnsetDefaults", () => {
  it("returns a default when the preference is known and the user did not set it", () => {
    const result = selectUnsetDefaults({ "editor.tabSize": 2 }, () => state(true, false));
    assert.deepStrictEqual(result, { "editor.tabSize": 2 });
  });

  it("leaves out a preference that the user already set", () => {
    const result = selectUnsetDefaults({ "editor.tabSize": 2 }, () => state(true, true));
    assert.deepStrictEqual(result, {});
  });

  it("leaves out a preference that the application does not know", () => {
    const result = selectUnsetDefaults({ "editor.notReal": true }, () => state(false, false));
    assert.deepStrictEqual(result, {});
  });

  it("decides each preference separately", () => {
    const states: Record<string, PreferenceState> = {
      "editor.tabSize": state(true, false),
      "editor.formatOnSave": state(true, true),
      "editor.notReal": state(false, false),
    };
    const result = selectUnsetDefaults(
      { "editor.tabSize": 2, "editor.formatOnSave": true, "editor.notReal": true },
      (name) => states[name],
    );
    assert.deepStrictEqual(result, { "editor.tabSize": 2 });
  });
});

describe("DEFAULT_PREFERENCES", () => {
  it("runs the ESLint fixes on save", () => {
    assert.deepStrictEqual(DEFAULT_PREFERENCES["editor.codeActionsOnSave"], {
      "source.fixAll.eslint": true,
    });
  });

  it("shows whitespace changes in diffs", () => {
    assert.strictEqual(DEFAULT_PREFERENCES["diffEditor.ignoreTrimWhitespace"], false);
  });
});
