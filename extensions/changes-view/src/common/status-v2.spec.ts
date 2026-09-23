import * as assert from "node:assert";
import { parseStatusV2 } from "./status-v2";

describe("parseStatusV2", () => {
  it("sorts the tracked entries by path, conflicts included, and keeps untracked entries last, as version 1 did", () => {
    const h =
      "N... 100644 100644 100644 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111";
    const u =
      "N... 100644 100644 100644 100644 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111";
    const result = parseStatusV2(
      `1 .M ${h} b.ts\x001 .M ${h} d.ts\x00u AA ${u} a.ts\x00u UU ${u} c.ts\x00? 0-new.ts\x00`,
    );
    assert.deepStrictEqual(
      result.files.map((file) => `${file.status}|${file.path}`),
      ["AA|a.ts", " M|b.ts", "UU|c.ts", " M|d.ts", "??|0-new.ts"],
    );
  });

  it("returns an empty branch and no files for empty output", () => {
    assert.deepStrictEqual(parseStatusV2(""), { branch: "", detached: false, files: [] });
  });

  it("reads the branch name from the branch.oid and branch.head headers", () => {
    const result = parseStatusV2(
      "# branch.oid 82f468fcfea99ac6e02bfc7123147ea3996ba11e\0# branch.head main\0",
    );
    assert.strictEqual(result.branch, "main");
    assert.strictEqual(result.detached, false);
  });

  it("gives an empty branch and detached: false when branch.oid is '(initial)', even with a real branch.head", () => {
    const result = parseStatusV2("# branch.oid (initial)\0# branch.head main\0");
    assert.strictEqual(result.branch, "");
    assert.strictEqual(result.detached, false);
  });

  it("gives an empty branch and detached: true when branch.head is '(detached)'", () => {
    const result = parseStatusV2(
      "# branch.oid 82f468fcfea99ac6e02bfc7123147ea3996ba11e\0# branch.head (detached)\0",
    );
    assert.strictEqual(result.branch, "");
    assert.strictEqual(result.detached, true);
  });

  it("ignores the branch.upstream and branch.ab headers", () => {
    const result = parseStatusV2(
      "# branch.oid 82f468fcfea99ac6e02bfc7123147ea3996ba11e\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +0 -0\0",
    );
    assert.strictEqual(result.branch, "main");
    assert.deepStrictEqual(result.files, []);
  });

  it("ignores an unknown header line", () => {
    const result = parseStatusV2(
      "# branch.oid 82f468fcfea99ac6e02bfc7123147ea3996ba11e\0# branch.head main\0# stash 1\0",
    );
    assert.strictEqual(result.branch, "main");
    assert.deepStrictEqual(result.files, []);
  });

  it("parses an ordinary entry (record 1) with an unstaged change, mapping '.' to a space", () => {
    const result = parseStatusV2("1 .M N... 100644 100644 100644 aaa bbb src/index.ts\0");
    assert.deepStrictEqual(result.files, [{ status: " M", path: "src/index.ts" }]);
  });

  it("parses an ordinary entry (record 1) with a staged change, mapping '.' to a space", () => {
    const result = parseStatusV2("1 M. N... 100644 100644 100644 aaa bbb src/index.ts\0");
    assert.deepStrictEqual(result.files, [{ status: "M ", path: "src/index.ts" }]);
  });

  it("parses an ordinary entry (record 1) with a staged and an unstaged change", () => {
    const result = parseStatusV2("1 MM N... 100644 100644 100644 aaa bbb src/index.ts\0");
    assert.deepStrictEqual(result.files, [{ status: "MM", path: "src/index.ts" }]);
  });

  it("parses a rename (record 2, R in the first column) with sourcePath, not copyOf", () => {
    const result = parseStatusV2("2 R. N... 100644 100644 100644 aaa bbb R100 new-name.ts\0old-name.ts\0");
    assert.deepStrictEqual(result.files, [{ status: "R ", path: "new-name.ts", sourcePath: "old-name.ts" }]);
  });

  it("parses a rename with R in the second column, as 'git add -N' reports it", () => {
    const result = parseStatusV2("2 .R N... 100644 100644 100644 aaa bbb R100 renamed.ts\0old-name.ts\0");
    assert.deepStrictEqual(result.files, [{ status: " R", path: "renamed.ts", sourcePath: "old-name.ts" }]);
  });

  it("keeps a slash in the source path of a rename intact", () => {
    const result = parseStatusV2("2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\0old/sub/path.ts\0");
    assert.deepStrictEqual(result.files, [{ status: "R ", path: "new.ts", sourcePath: "old/sub/path.ts" }]);
  });

  it("parses a copy (record 2, C in the first column) with copyOf, not sourcePath", () => {
    const result = parseStatusV2("2 C. N... 100644 100644 100644 aaa bbb C100 copy.ts\0src.ts\0");
    assert.deepStrictEqual(result.files, [{ status: "C ", path: "copy.ts", copyOf: "src.ts" }]);
  });

  it("parses an untracked entry (record ?)", () => {
    const result = parseStatusV2("? notes.md\0");
    assert.deepStrictEqual(result.files, [{ status: "??", path: "notes.md" }]);
  });

  it("skips an ignored entry (record !)", () => {
    const result = parseStatusV2("? notes.md\0! dist/bundle.js\0");
    assert.deepStrictEqual(
      result.files.map((file) => file.path),
      ["notes.md"],
    );
  });

  for (const status of ["DD", "AU", "UD", "UA", "DU", "AA", "UU"]) {
    it(`parses the unmerged entry (record u) with status ${status}, unchanged`, () => {
      const result = parseStatusV2(`u ${status} N... 100644 100644 100644 100644 aaa bbb ccc f.txt\0`);
      assert.deepStrictEqual(result.files, [{ status, path: "f.txt" }]);
    });
  }

  it("parses a path with a space, unquoted because of core.quotepath=off", () => {
    const result = parseStatusV2('1 A. N... 100644 100644 100644 aaa bbb we "ird".ts\0');
    assert.deepStrictEqual(result.files, [{ status: "A ", path: 'we "ird".ts' }]);
  });

  it("parses a path with a quote", () => {
    const result = parseStatusV2('? quo"te.txt\0');
    assert.deepStrictEqual(result.files, [{ status: "??", path: 'quo"te.txt' }]);
  });

  it("keeps a newline inside a path intact, since only NUL ends a record", () => {
    const result = parseStatusV2("? line1\nline2.txt\0");
    assert.deepStrictEqual(result.files, [{ status: "??", path: "line1\nline2.txt" }]);
  });

  it("parses a non-ASCII path", () => {
    const result = parseStatusV2("? héllo.txt\0? éclair.txt\0");
    assert.deepStrictEqual(
      result.files.map((file) => file.path),
      ["héllo.txt", "éclair.txt"],
    );
  });

  it("parses headers, ordinary, rename, and untracked records together, in one call", () => {
    const stdout =
      "# branch.oid 82f468fcfea99ac6e02bfc7123147ea3996ba11e\0" +
      "# branch.head main\0" +
      "1 .M N... 100644 100644 100644 aaa bbb index.ts\0" +
      "2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\0old.ts\0" +
      "? untracked.ts\0";
    const result = parseStatusV2(stdout);
    assert.strictEqual(result.branch, "main");
    assert.strictEqual(result.detached, false);
    assert.deepStrictEqual(result.files, [
      { status: " M", path: "index.ts" },
      { status: "R ", path: "new.ts", sourcePath: "old.ts" },
      { status: "??", path: "untracked.ts" },
    ]);
  });
});
