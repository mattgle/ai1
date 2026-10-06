import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { prepareElectronNotices, writeVerifiedRuntimeNotice } from "./prepare-electron-notices.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(context) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-runtime-notices-")));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "app");
  fs.mkdirSync(payload);
  return { root, payload };
}

test("runtime notice copies preserve source bytes and reuse matching files without modification", (context) => {
  const { payload } = fixture(context);
  const bytes = Buffer.from("Original notice\r\n");
  const target = path.join(payload, "LICENSE");
  writeVerifiedRuntimeNotice(bytes, target, hash(bytes), payload);
  const stat = fs.statSync(target);
  writeVerifiedRuntimeNotice(bytes, target, hash(bytes), payload);
  assert.ok(fs.readFileSync(target).equals(bytes));
  assert.equal(fs.statSync(target).ino, stat.ino);
  assert.equal(fs.statSync(target).mtimeMs, stat.mtimeMs);
  assert.equal(fs.statSync(target).mode & 0o777, 0o644);
  assert.deepEqual(fs.readdirSync(payload), ["LICENSE"]);
});

test("changed source or existing notice bytes fail without overwriting files", (context) => {
  const { payload } = fixture(context);
  const bytes = Buffer.from("Reviewed notice");
  const target = path.join(payload, "LICENSE");
  assert.throws(() => writeVerifiedRuntimeNotice(bytes, target, "0".repeat(64), payload), /hash mismatch/);
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, "Existing user file");
  assert.throws(() => writeVerifiedRuntimeNotice(bytes, target, hash(bytes), payload), /does not match/);
  assert.equal(fs.readFileSync(target, "utf8"), "Existing user file");
});

test("runtime notice copies reject escaping directories and existing links", (context) => {
  const { root, payload } = fixture(context);
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  const bytes = Buffer.from("Reviewed notice");
  fs.symlinkSync(outside, path.join(payload, "linked"));
  assert.throws(
    () => writeVerifiedRuntimeNotice(bytes, path.join(payload, "linked/LICENSE"), hash(bytes), payload),
    /escapes/,
  );
  assert.deepEqual(fs.readdirSync(outside), []);
  const link = path.join(payload, "LICENSE");
  fs.symlinkSync(path.join(outside, "missing.txt"), link);
  assert.throws(() => writeVerifiedRuntimeNotice(bytes, link, hash(bytes), payload), /does not match/);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
});

test("notice preparation preserves both complete pinned installed runtime notices", (context) => {
  const { payload } = fixture(context);
  const report = prepareElectronNotices({ payload, electronVersion: "42.11.8" });
  assert.equal(report.notices.length, 2);
  assert.equal(report.electronVersion, "42.11.8");
  for (const notice of report.notices) {
    const bytes = fs.readFileSync(path.join(payload, notice.path));
    assert.equal(bytes.length, notice.bytes);
    assert.equal(hash(bytes), notice.sha256);
  }
  assert.deepEqual(prepareElectronNotices({ payload, electronVersion: "42.11.8" }), report);
  assert.equal(JSON.stringify(report).includes(payload), false);
});

test("runtime version and source hash mismatches stop before creating output notices", (context) => {
  const { root, payload } = fixture(context);
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "version"), "42.11.7");
  assert.throws(
    () => prepareElectronNotices({ payload, electronVersion: "42.11.8", electronDist: source }),
    /version mismatch/,
  );
  fs.writeFileSync(path.join(source, "version"), "42.11.8");
  fs.writeFileSync(path.join(source, "LICENSE"), "Wrong notice");
  assert.throws(
    () => prepareElectronNotices({ payload, electronVersion: "42.11.8", electronDist: source }),
    /hash mismatch/,
  );
  assert.deepEqual(fs.readdirSync(payload), []);
});

test("notice preparation rejects escaping parent links before creating external directories", (context) => {
  const { root, payload } = fixture(context);
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(payload, "resources"));
  assert.throws(() => prepareElectronNotices({ payload, electronVersion: "42.11.8" }), /escapes/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
