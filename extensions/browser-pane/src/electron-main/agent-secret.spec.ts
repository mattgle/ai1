import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeSecret, readOrCreateSecret, stripSecret } from "./agent-secret";

describe("agent secret", () => {
  it("makes a 43-character base64url secret, different each time", () => {
    const first = makeSecret();
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notStrictEqual(first, makeSecret());
  });

  it("keeps the secret in a file that only the owner can read", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-secret-"));
    try {
      const file = path.join(folder, "secret");
      const first = readOrCreateSecret(file);
      assert.strictEqual(readOrCreateSecret(file), first);
      assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it("gives the rest of the path after the right secret", () => {
    assert.strictEqual(stripSecret("/abc/json/version", "abc"), "/json/version");
    assert.strictEqual(stripSecret("/abc/json/version/?x=1", "abc"), "/json/version/");
    assert.strictEqual(stripSecret("/abc", "abc"), "/");
    assert.strictEqual(stripSecret("/abc/", "abc"), "/");
  });

  it("gives nothing for a wrong, a missing, or a longer secret", () => {
    for (const url of ["/abd/json/version", "/json/version", "/", "", "/abcd/json", "/ab/json"]) {
      assert.strictEqual(stripSecret(url, "abc"), undefined, url);
    }
  });
});
