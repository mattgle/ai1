export const COOKIE_IMPORT_FAMILIES = ["chrome", "arc", "brave"] as const;

export const COOKIE_IMPORT_UNSUPPORTED =
  "External browser cookie import is supported on macOS only. Log in inside the selected AI1 browser profile.";

export type CookieImportFamily = (typeof COOKIE_IMPORT_FAMILIES)[number];

export interface CookieImportSource {
  family: CookieImportFamily;
  browserName: string;
  profileName: string;
  profileDirectory: string;
}

export interface CookieImportResult {
  imported: number;
  skipped: number;
  browserName: string;
  browserProfile: string;
  targetProfile: string;
}
