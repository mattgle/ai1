import { randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export function makeSecret(): string {
  return randomBytes(32).toString("base64url");
}

// The secret stays the same across restarts, so the owner's MCP config
// keeps working. The file is readable by the owner only.
export function readOrCreateSecret(filePath: string): string {
  try {
    const existing = fs.readFileSync(filePath, "utf8").trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(existing)) {
      return existing;
    }
  } catch {
    // No file yet.
  }
  const secret = makeSecret();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, secret, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return secret;
}

// The agent address is `/<secret>/...`. Gives the path after the secret,
// without the query, or `undefined` when the first part is not the secret.
export function stripSecret(requestUrl: string, secret: string): string | undefined {
  const pathOnly = requestUrl.split("?")[0];
  if (!pathOnly.startsWith("/")) {
    return undefined;
  }
  const slash = pathOnly.indexOf("/", 1);
  const first = slash === -1 ? pathOnly.slice(1) : pathOnly.slice(1, slash);
  const given = Buffer.from(first);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return undefined;
  }
  return slash === -1 ? "/" : pathOnly.slice(slash);
}
