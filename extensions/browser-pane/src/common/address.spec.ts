import * as assert from "node:assert";
import { ADDRESS_HINT, isAllowedGuestUrl, normalizeAddress } from "./address";

describe("normalizeAddress", () => {
  const ok = (input: string): string => {
    const result = normalizeAddress(input);
    assert.ok(result.ok, `expected ${input} to be accepted`);
    return result.url;
  };

  it("keeps a full http or https address", () => {
    assert.strictEqual(ok("https://example.com/a?b=1"), "https://example.com/a?b=1");
    assert.strictEqual(ok("http://localhost:3000/"), "http://localhost:3000/");
  });

  it("adds http to localhost and to an IP address, with or without a port", () => {
    assert.strictEqual(ok("localhost:5173"), "http://localhost:5173/");
    assert.strictEqual(ok("127.0.0.1:8080/api"), "http://127.0.0.1:8080/api");
    assert.strictEqual(ok("[::1]:3000"), "http://[::1]:3000/");
    assert.strictEqual(ok("localhost"), "http://localhost/");
  });

  it("adds https to a host name with a dot", () => {
    assert.strictEqual(ok("example.com"), "https://example.com/");
    assert.strictEqual(ok("docs.example.com/path"), "https://docs.example.com/path");
  });

  it("keeps about:blank", () => {
    assert.strictEqual(ok("about:blank"), "about:blank");
  });

  it("trims the input", () => {
    assert.strictEqual(ok("  example.com  "), "https://example.com/");
  });

  it("refuses words that are not an address, with the hint", () => {
    for (const input of ["hello world", "ai1", ""]) {
      assert.deepStrictEqual(normalizeAddress(input), { ok: false, message: ADDRESS_HINT });
    }
  });

  it("refuses a scheme other than http and https", () => {
    for (const input of ["file:///etc/hosts", "javascript:alert(1)", "ftp://example.com/"]) {
      const result = normalizeAddress(input);
      assert.strictEqual(result.ok, false);
    }
  });
});

describe("isAllowedGuestUrl", () => {
  it("allows http, https, and about:blank only", () => {
    assert.strictEqual(isAllowedGuestUrl("https://example.com/"), true);
    assert.strictEqual(isAllowedGuestUrl("http://localhost:3000/"), true);
    assert.strictEqual(isAllowedGuestUrl("about:blank"), true);
    assert.strictEqual(isAllowedGuestUrl("file:///etc/hosts"), false);
    assert.strictEqual(isAllowedGuestUrl("javascript:alert(1)"), false);
    assert.strictEqual(isAllowedGuestUrl("not a url"), false);
  });
});
