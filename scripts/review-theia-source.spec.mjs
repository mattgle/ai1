import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { compareFile, reviewTheiaSource, verifyArchive } from "./review-theia-source.mjs";

test("source review rejects empty inventories and mismatched package names", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-source-inventory-"));
  try {
    const modules = path.join(root, "node_modules/@theia");
    fs.mkdirSync(modules, { recursive: true });
    const lockfile = path.join(root, "package-lock.json");
    fs.writeFileSync(lockfile, JSON.stringify({ packages: {} }));
    await assert.rejects(reviewTheiaSource(root, lockfile), /No Theia/);
    fs.mkdirSync(path.join(modules, "core"));
    fs.writeFileSync(
      path.join(modules, "core/package.json"),
      JSON.stringify({ name: "other", version: "1.75.0" }),
    );
    await assert.rejects(reviewTheiaSource(root, lockfile), /does not match its folder/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("source review requires the exact lockfile archive integrity", () => {
  const bytes = Buffer.from("Published archive");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  verifyArchive(bytes, integrity);
  assert.throws(() => verifyArchive(Buffer.from("Changed archive"), integrity), /does not match/);
  assert.throws(() => verifyArchive(bytes, "sha1-old"), /SHA-512/);
});

test("source comparison checks bytes without writing and rejects escaping paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-source-review-"));
  try {
    const folder = path.join(root, "package");
    fs.mkdirSync(path.join(folder, "src"), { recursive: true });
    const bytes = Buffer.from("Original source\r\n");
    fs.writeFileSync(path.join(folder, "src/file.ts"), bytes);
    assert.equal(compareFile(folder, "package/src/file.ts", bytes), "equal");
    assert.equal(compareFile(folder, "package/src/file.ts", Buffer.from("Changed source")), "changed");
    assert.equal(compareFile(folder, "package/src/missing.ts", bytes), "absent");
    for (const name of [
      "package/../file.ts",
      "package//file.ts",
      "package/src/./file.ts",
      "other/src/file.ts",
      "package/src\\file.ts",
    ])
      assert.throws(() => compareFile(folder, name, bytes), /Invalid archive path/);
    fs.writeFileSync(path.join(root, "external.ts"), bytes);
    fs.symlinkSync(path.join(root, "external.ts"), path.join(folder, "src/link.ts"));
    assert.throws(() => compareFile(folder, "package/src/link.ts", bytes), /escapes/);
    assert.deepEqual(fs.readFileSync(path.join(folder, "src/file.ts")), bytes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
