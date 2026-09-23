export const DEFAULT_VISIBLE_PER_GROUP = 30;

// Theia 1.75 does not validate a preference's value against its schema when
// `PreferenceService.get()` reads it back (the schema drives the Settings
// UI and a `preferences.json` linter, not a runtime guard), so a value
// written by hand, or by an older/other extension, can be anything at all.
// This clamps `ai1.agents.visibleSessionsPerGroup` to a safe, usable count:
// anything that is not a finite number, or is below 1, gives the default;
// a valid value is floored to an integer.
export function clampVisiblePerGroup(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_VISIBLE_PER_GROUP;
  }
  return Math.floor(value);
}
