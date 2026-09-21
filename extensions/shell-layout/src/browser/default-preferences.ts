// The preferences that AI1 sets on the first start. The list comes from the
// "Default preferences" section of the design document.
export const DEFAULT_PREFERENCES: Readonly<Record<string, unknown>> = {
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "dbaeumer.vscode-eslint",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "editor.tabSize": 2,
  "editor.minimap.enabled": false,
  "editor.stickyScroll.enabled": true,
  "editor.enablePreview": false,
  "diffEditor.ignoreTrimWhitespace": false,
};

export interface PreferenceState {
  // The application has a schema for this preference.
  known: boolean;
  // The user settings file already contains a value for this preference.
  setByUser: boolean;
}

// Returns the defaults that are safe to write: the application knows the
// preference, and the user did not choose a value.
export function selectUnsetDefaults(
  defaults: Readonly<Record<string, unknown>>,
  stateOf: (name: string) => PreferenceState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(defaults)) {
    const { known, setByUser } = stateOf(name);
    if (known && !setByUser) {
      result[name] = value;
    }
  }
  return result;
}
