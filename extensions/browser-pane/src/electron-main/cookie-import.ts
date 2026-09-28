import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { session } from "@theia/core/electron-shared/electron";
import {
  COOKIE_IMPORT_FAMILIES,
  CookieImportFamily,
  CookieImportResult,
  CookieImportSource,
} from "../common/cookie-import";
import { Profile, partitionFor } from "../common/profiles";

interface BrowserDefinition {
  family: CookieImportFamily;
  browserName: string;
  root: string;
  keychainService: string;
  keychainAccount: string;
}

interface ChromiumProfile {
  profileName: string;
  profileDirectory: string;
}

interface ChromiumCookieRow {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Uint8Array;
  path: string;
  is_secure: number | bigint;
  is_httponly: number | bigint;
  expires_utc: number | bigint;
  samesite: number | bigint;
}

interface CookieStore {
  set(details: {
    url: string;
    name: string;
    value: string;
    domain?: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
    sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  }): Promise<void>;
}

const BROWSER_ROOTS: Record<
  CookieImportFamily,
  { path: string; name: string; service: string; account: string }
> = {
  chrome: {
    path: "Google/Chrome",
    name: "Google Chrome",
    service: "Chrome Safe Storage",
    account: "Chrome",
  },
  arc: { path: "Arc/User Data", name: "Arc", service: "Arc Safe Storage", account: "Arc" },
  brave: {
    path: "BraveSoftware/Brave-Browser",
    name: "Brave",
    service: "Brave Safe Storage",
    account: "Brave",
  },
};

const CHROMIUM_EPOCH_SECONDS = 11_644_473_600;

function browserDefinitions(home: string): BrowserDefinition[] {
  return COOKIE_IMPORT_FAMILIES.map((family) => {
    const definition = BROWSER_ROOTS[family];
    return {
      family,
      browserName: definition.name,
      root: path.join(home, "Library", "Application Support", definition.path),
      keychainService: definition.service,
      keychainAccount: definition.account,
    };
  });
}

function isSafeProfileDirectory(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

function cookieDatabasePath(profilePath: string): string | undefined {
  for (const candidate of [path.join(profilePath, "Network", "Cookies"), path.join(profilePath, "Cookies")]) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // A browser may remove or replace its database while AI1 lists profiles.
    }
  }
  return undefined;
}

function discoverProfiles(root: string): ChromiumProfile[] {
  const stateFile = path.join(root, "Local State");
  let profileInfo: Record<string, { name?: unknown }> = {};
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: unknown }> };
    };
    profileInfo = state.profile?.info_cache ?? {};
  } catch {
    // Chromium can omit Local State in older or partially installed profiles.
  }
  const directories = new Set<string>(["Default"]);
  for (const directory of Object.keys(profileInfo)) {
    if (isSafeProfileDirectory(directory)) {
      directories.add(directory);
    }
  }
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && isSafeProfileDirectory(entry.name)) {
        directories.add(entry.name);
      }
    }
  } catch {
    return [];
  }
  return [...directories].flatMap((profileDirectory) => {
    const profilePath = path.join(root, profileDirectory);
    if (!cookieDatabasePath(profilePath)) {
      return [];
    }
    const displayName = profileInfo[profileDirectory]?.name;
    return [
      {
        profileDirectory,
        profileName:
          typeof displayName === "string" && displayName.trim()
            ? displayName.slice(0, 100)
            : profileDirectory,
      },
    ];
  });
}

export function detectCookieImportSources(
  home = os.homedir(),
  platform = process.platform,
): CookieImportSource[] {
  if (platform !== "darwin") {
    return [];
  }
  return browserDefinitions(home).flatMap((definition) =>
    discoverProfiles(definition.root).map((profile) => ({
      family: definition.family,
      browserName: definition.browserName,
      profileName: profile.profileName,
      profileDirectory: profile.profileDirectory,
    })),
  );
}

function resolveSource(
  source: CookieImportSource,
  home = os.homedir(),
): { definition: BrowserDefinition; databasePath: string; profileName: string } | undefined {
  if (
    !source ||
    typeof source !== "object" ||
    !COOKIE_IMPORT_FAMILIES.includes(source.family) ||
    !isSafeProfileDirectory(source.profileDirectory)
  ) {
    return undefined;
  }
  const definition = browserDefinitions(home).find((candidate) => candidate.family === source.family);
  if (!definition) {
    return undefined;
  }
  const profilePath = path.join(definition.root, source.profileDirectory);
  const databasePath = cookieDatabasePath(profilePath);
  const profile = discoverProfiles(definition.root).find(
    (candidate) => candidate.profileDirectory === source.profileDirectory,
  );
  if (!databasePath || !profile) {
    return undefined;
  }
  return { definition, databasePath, profileName: profile.profileName };
}

function readMacKeychainPassword(service: string, account: string): string {
  try {
    const output = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] },
    );
    if (output.trim()) {
      return output.trim();
    }
  } catch {
    // Do not include command output or key material in errors or logs.
  }
  throw new Error(
    `AI1 could not read ${account}'s cookie key from macOS Keychain. Unlock Keychain and try again.`,
  );
}

export function decryptChromiumCookie(encryptedValue: Uint8Array, password: string): string | undefined {
  const encrypted = Buffer.from(encryptedValue);
  const version = encrypted.subarray(0, 3).toString("ascii");
  if ((version !== "v10" && version !== "v11") || encrypted.length <= 3) {
    return undefined;
  }
  try {
    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
    let value = plaintext;
    if (plaintext.length > 32) {
      let nonPrintablePrefixBytes = 0;
      for (const byte of plaintext.subarray(0, 32)) {
        if (byte < 0x20 || byte > 0x7e) {
          nonPrintablePrefixBytes += 1;
        }
      }
      if (nonPrintablePrefixBytes >= 8) {
        value = plaintext.subarray(32);
      }
    }
    return value.toString("latin1");
  } catch {
    return undefined;
  }
}

function sameSiteFor(value: number | bigint): "unspecified" | "no_restriction" | "lax" | "strict" {
  switch (Number(value)) {
    case 0:
      return "no_restriction";
    case 1:
      return "lax";
    case 2:
      return "strict";
    default:
      return "unspecified";
  }
}

function cookieExpiration(value: number | bigint): number | undefined {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }
  const seconds = timestamp / 1_000_000 - CHROMIUM_EPOCH_SECONDS;
  return seconds > Date.now() / 1000 ? seconds : undefined;
}

function cookieIsExpired(value: number | bigint): boolean {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }
  return timestamp / 1_000_000 - CHROMIUM_EPOCH_SECONDS <= Date.now() / 1000;
}

function domainForCookie(hostKey: string): { url: string; domain?: string } | undefined {
  const hostOnly = !hostKey.startsWith(".");
  const hostname = hostKey.replace(/^\.+/, "").toLowerCase();
  if (!hostname || /[^a-z0-9.\-:[\]]/i.test(hostname)) {
    return undefined;
  }
  try {
    const parsed = new URL(`https://${hostname}/`);
    if (parsed.hostname !== hostname || parsed.username || parsed.password || parsed.port) {
      return undefined;
    }
    return { url: parsed.origin, ...(hostOnly ? {} : { domain: hostname }) };
  } catch {
    return undefined;
  }
}

export async function importCookiesToProfile(
  source: CookieImportSource,
  targetProfileId: string,
  profiles: Profile[],
  keychainPassword?: (service: string, account: string) => string,
  cookieStore?: CookieStore,
  home = os.homedir(),
): Promise<CookieImportResult> {
  const target = profiles.find((profile) => profile.id === targetProfileId);
  if (!target) {
    throw new Error("The target browser profile does not exist.");
  }
  const resolved = resolveSource(source, home);
  if (!resolved) {
    throw new Error("The source browser profile is no longer available. Refresh the list and try again.");
  }
  const store = cookieStore ?? session.fromPartition(partitionFor(target.id)).cookies;
  const password = (keychainPassword ?? readMacKeychainPassword)(
    resolved.definition.keychainService,
    resolved.definition.keychainAccount,
  );
  const db = new DatabaseSync(resolved.databasePath, {
    readOnly: true,
    readBigInts: true,
  });
  let imported = 0;
  let skipped = 0;
  try {
    const rows = db.prepare("SELECT * FROM cookies ORDER BY rowid").all() as ChromiumCookieRow[];
    for (const row of rows) {
      const host = domainForCookie(row.host_key);
      const name = typeof row.name === "string" ? row.name : "";
      const normalizedDomain = row.host_key.replace(/^\.+/, "").toLowerCase();
      if (
        !host ||
        !name ||
        normalizedDomain === "google.com" ||
        normalizedDomain.endsWith(".google.com") ||
        cookieIsExpired(row.expires_utc)
      ) {
        skipped += 1;
        continue;
      }
      const encrypted = row.encrypted_value instanceof Uint8Array ? row.encrypted_value : new Uint8Array();
      const value =
        encrypted.length > 0
          ? decryptChromiumCookie(encrypted, password)
          : typeof row.value === "string"
            ? row.value
            : undefined;
      if (value === undefined) {
        skipped += 1;
        continue;
      }
      try {
        await store.set({
          url: host.url,
          ...(host.domain ? { domain: host.domain } : {}),
          name,
          value,
          path: typeof row.path === "string" && row.path.startsWith("/") ? row.path : "/",
          secure: Number(row.is_secure) === 1,
          httpOnly: Number(row.is_httponly) === 1,
          expirationDate: cookieExpiration(row.expires_utc),
          sameSite: sameSiteFor(row.samesite),
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
  } finally {
    db.close();
  }
  return {
    imported,
    skipped,
    browserName: resolved.definition.browserName,
    browserProfile: resolved.profileName,
    targetProfile: target.name,
  };
}
