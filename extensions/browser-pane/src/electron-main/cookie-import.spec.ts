import * as assert from "node:assert";
import { createCipheriv, pbkdf2Sync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptChromiumCookie, detectCookieImportSources, importCookiesToProfile } from "./cookie-import";

describe("cookie import", () => {
  it("rejects Linux and Windows import before it reads data or writes cookies", async () => {
    for (const platform of ["linux", "win32"] as const) {
      let accessed = false;
      await assert.rejects(
        importCookiesToProfile(
          { family: "chrome", browserName: "Chrome", profileName: "Default", profileDirectory: "../outside" },
          "missing",
          [],
          () => {
            accessed = true;
            return "unused";
          },
          {
            set: async () => {
              accessed = true;
            },
          },
          "/missing-home",
          platform,
        ),
        /supported on macOS only/,
      );
      assert.equal(accessed, false);
    }
  });
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-cookie-import-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function createChromiumProfile(family: "chrome" | "arc" | "brave", directory = "Default"): string {
    const roots = {
      chrome: "Google/Chrome",
      arc: "Arc/User Data",
      brave: "BraveSoftware/Brave-Browser",
    };
    const browserRoot = path.join(root, "Library", "Application Support", roots[family]);
    const profile = path.join(browserRoot, directory);
    fs.mkdirSync(path.join(profile, "Network"), { recursive: true });
    fs.writeFileSync(
      path.join(browserRoot, "Local State"),
      JSON.stringify({ profile: { info_cache: { [directory]: { name: "Test Profile" } } } }),
    );
    return path.join(profile, "Network", "Cookies");
  }

  function encryptedCookie(value: string, password: string): Buffer {
    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
    return Buffer.concat([Buffer.from("v10"), cipher.update(value, "latin1"), cipher.final()]);
  }

  it("detects only Chrome, Arc, and Brave profiles that have a cookie database", () => {
    const chromeDb = createChromiumProfile("chrome");
    const arcDb = createChromiumProfile("arc", "Profile 1");
    createChromiumProfile("brave");
    fs.writeFileSync(chromeDb, "fixture");
    fs.writeFileSync(arcDb, "fixture");

    const sources = detectCookieImportSources(root, "darwin");
    assert.deepStrictEqual(
      sources.map(({ family, profileName, profileDirectory }) => ({ family, profileName, profileDirectory })),
      [
        { family: "chrome", profileName: "Test Profile", profileDirectory: "Default" },
        { family: "arc", profileName: "Test Profile", profileDirectory: "Profile 1" },
      ],
    );
    for (const platform of ["linux", "win32"] as const) {
      assert.throws(() => detectCookieImportSources(root, platform), /supported on macOS only/);
    }
  });

  it("decrypts Chromium v10 cookies and refuses unsupported or invalid ciphertext", () => {
    const secret = "browser safe storage";
    assert.equal(decryptChromiumCookie(encryptedCookie("auth=value", secret), secret), "auth=value");
    assert.equal(decryptChromiumCookie(Buffer.from("v20unsupported"), secret), undefined);
    assert.equal(decryptChromiumCookie(encryptedCookie("wrong", secret), "another key"), undefined);
  });

  it("imports decrypted cookies into one AI1 profile without clearing its other cookies", async () => {
    const cookiesPath = createChromiumProfile("chrome");
    const db = new DatabaseSync(cookiesPath);
    db.exec(`CREATE TABLE cookies (
      host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT,
      is_secure INTEGER, is_httponly INTEGER, expires_utc INTEGER, samesite INTEGER
    )`);
    const insert = db.prepare("INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insert.run(".example.test", "auth", "", encryptedCookie("signed-in", "fixture-secret"), "/", 1, 1, 0, 1);
    insert.run("example.test", "plain", "plain-value", Buffer.alloc(0), "/account", 0, 0, 0, -1);
    insert.run(".google.com", "SID", "not-imported", Buffer.alloc(0), "/", 1, 1, 0, 0);
    insert.run("expired.example.test", "expired", "old-value", Buffer.alloc(0), "/", 0, 0, 1, 0);
    db.close();

    const cookieWrites: Record<string, unknown>[] = [];
    const targetProfile = { id: "p-test", name: "Work" };
    const result = await importCookiesToProfile(
      {
        family: "chrome",
        browserName: "Google Chrome",
        profileName: "Test Profile",
        profileDirectory: "Default",
      },
      targetProfile.id,
      [targetProfile],
      (service, account) => {
        assert.equal(service, "Chrome Safe Storage");
        assert.equal(account, "Chrome");
        return "fixture-secret";
      },
      { set: async (cookie) => void cookieWrites.push({ ...cookie }) },
      root,
      "darwin",
    );

    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 2);
    assert.equal(result.targetProfile, "Work");
    assert.equal(cookieWrites[0].value, "signed-in");
    assert.equal(cookieWrites[0].domain, "example.test");
    assert.equal(cookieWrites[0].secure, true);
    assert.equal(cookieWrites[0].httpOnly, true);
    assert.equal(cookieWrites[1].value, "plain-value");
    assert.equal(cookieWrites[1].domain, undefined);
    assert.equal(cookieWrites[1].path, "/account");
  });

  it("refuses an unknown target and a source profile path that leaves the browser root", async () => {
    await assert.rejects(
      importCookiesToProfile(
        {
          family: "chrome",
          browserName: "Google Chrome",
          profileName: "Default",
          profileDirectory: "../outside",
        },
        "missing",
        [],
        () => "unused",
        { set: async () => undefined },
        root,
        "darwin",
      ),
      /target browser profile does not exist/,
    );
  });
});
