import * as assert from "node:assert";
import { decodeHeadUri, encodeHeadUri, HEAD_SCHEME } from "./head-uri";

describe("head URI", () => {
  it("round-trips the repository and the path", () => {
    const uri = encodeHeadUri("file:///work/payments-api", "src/routes/index.ts");
    assert.deepStrictEqual(decodeHeadUri(uri), {
      repoRootUri: "file:///work/payments-api",
      path: "src/routes/index.ts",
    });
  });

  it("uses its own scheme and keeps the file name, so that the editor selects the language", () => {
    const uri = encodeHeadUri("file:///work/payments-api", "src/routes/index.ts");
    assert.strictEqual(uri.scheme, HEAD_SCHEME);
    assert.strictEqual(uri.path.base, "index.ts");
  });

  it("round-trips a path with spaces and special characters", () => {
    const uri = encodeHeadUri("file:///work/my%20repo", "docs/a b&c?.md");
    assert.strictEqual(decodeHeadUri(uri).path, "docs/a b&c?.md");
  });
});
