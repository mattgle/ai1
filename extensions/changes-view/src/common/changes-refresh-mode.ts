export const CHANGES_REFRESH_MODE = "ai1.changes.refreshMode";
export type ChangesRefreshMode = "automatic" | "manual";

export function normalizeRefreshMode(value: unknown): ChangesRefreshMode {
  return value === "manual" ? "manual" : "automatic";
}
