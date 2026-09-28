export const COOKIE_IMPORT_FAMILIES = ["chrome", "arc", "brave"] as const;

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
