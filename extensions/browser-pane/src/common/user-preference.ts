import { PreferenceScope } from "@theia/core/lib/common/preferences/preference-scope";

// The part of Theia's `PreferenceService` that `userPreference` uses.
export interface ScopedPreferences {
  inspectInScope(preferenceName: string, scope: PreferenceScope): unknown;
}

// The value of a setting from the user settings only. A repository must not
// change these settings through its `.theia/settings.json`. The schema scope
// `PreferenceScope.User` only hides such a value in the Settings view: Theia
// 1.75 still gives it through `PreferenceService.get`.
export function userPreference<T extends string | number | boolean>(
  preferences: ScopedPreferences,
  preferenceName: string,
  fallback: T,
): T {
  const value = preferences.inspectInScope(preferenceName, PreferenceScope.User);
  return typeof value === typeof fallback ? (value as T) : fallback;
}
