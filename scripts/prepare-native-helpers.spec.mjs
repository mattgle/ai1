import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { prepareNativeHelpers, prepareBrandingModes } from "./prepare-native-helpers.mjs";

function fixture(t, platform = "darwin", arch = "arm64") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-native-helper-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "app");
  const files = [
    "lib/backend/native/rg",
    `lib/prebuilds/${platform}-${arch}/pty.node`,
    ...(platform === "darwin" ? ["lib/backend/macos-trash", "lib/prebuilds/darwin-arm64/spawn-helper"] : []),
  ];
  for (const name of files) {
    const file = path.join(payload, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `original ${name}\n`);
    fs.chmodSync(file, 0o777);
  }
  return { root, payload, platform, arch, files };
}

test("packaging removes writable modes from actual copied-helper paths without changing bytes", (t) => {
  const options = fixture(t);
  const originals = options.files.map((file) => fs.readFileSync(path.join(options.payload, file)));
  const report = prepareNativeHelpers(options);
  assert.equal(report.files.length, 4);
  for (const [index, name] of options.files.entries()) {
    const file = path.join(options.payload, name);
    assert.equal(fs.statSync(file).mode & 0o7777, name.endsWith(".node") ? 0o644 : 0o755);
    assert.ok(fs.readFileSync(file).equals(originals[index]));
  }
  assert.equal(JSON.stringify(report).includes(options.root), false);
  const second = prepareNativeHelpers(options);
  for (const entry of second.files) assert.equal(entry.originalMode, entry.packagedMode);
});

test("Linux helper modes meet the unchanged Arch staging mode policy", (t) => {
  const options = fixture(t, "linux", "x64");
  prepareNativeHelpers(options);
  for (const name of options.files)
    assert.equal(fs.statSync(path.join(options.payload, name)).mode & 0o7022, 0);
});

test("helper preparation validates every path before changing any mode", (t) => {
  const options = fixture(t);
  const last = path.join(options.payload, options.files.at(-1));
  fs.unlinkSync(last);
  assert.throws(() => prepareNativeHelpers(options), /ENOENT/);
  assert.equal(fs.statSync(path.join(options.payload, options.files[0])).mode & 0o7777, 0o777);
});

test("helper preparation rejects linked files and escaping parent directories", (t) => {
  const options = fixture(t);
  const outside = path.join(options.root, "outside");
  fs.writeFileSync(outside, "owner file");
  fs.chmodSync(outside, 0o600);
  const helper = path.join(options.payload, "lib/backend/native/rg");
  fs.unlinkSync(helper);
  fs.symlinkSync(outside, helper);
  assert.throws(() => prepareNativeHelpers(options), /linked/);
  assert.equal(fs.statSync(outside).mode & 0o7777, 0o600);
  fs.unlinkSync(helper);
  fs.rmdirSync(path.dirname(helper));
  const directory = path.join(options.root, "outside-native");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "rg"), "outside helper");
  fs.chmodSync(path.join(directory, "rg"), 0o600);
  fs.symlinkSync(directory, path.dirname(helper));
  assert.throws(() => prepareNativeHelpers(options), /outside/);
  assert.equal(fs.statSync(path.join(directory, "rg")).mode & 0o7777, 0o600);
});

test("unsupported targets leave copied helpers unchanged", (t) => {
  const options = fixture(t);
  assert.throws(() => prepareNativeHelpers({ ...options, platform: "win32" }), /reviewed/);
  assert.throws(() => prepareNativeHelpers({ ...options, arch: "x64" }), /reviewed/);
  assert.equal(fs.statSync(path.join(options.payload, options.files[0])).mode & 0o7777, 0o777);
});

test("helper preparation clears special bits and leaves unrelated files untouched", (t) => {
  const options = fixture(t);
  const unrelated = path.join(options.payload, "owner-file");
  fs.writeFileSync(unrelated, "owner bytes");
  fs.chmodSync(unrelated, 0o600);
  fs.chmodSync(path.join(options.payload, options.files[0]), 0o4777);
  prepareNativeHelpers(options);
  assert.equal(fs.statSync(path.join(options.payload, options.files[0])).mode & 0o7777, 0o755);
  assert.equal(fs.statSync(unrelated).mode & 0o7777, 0o600);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "owner bytes");
});

test("packaging restricts only the two known logo copies and preserves their bytes", (t) => {
  const options = fixture(t);
  const folder = path.join(options.payload, "resources/branding");
  fs.mkdirSync(folder, { recursive: true });
  for (const name of ["logo-dark.png", "logo-light.png", "unrelated.png"]) {
    fs.writeFileSync(path.join(folder, name), `original ${name}`);
    fs.chmodSync(path.join(folder, name), 0o664);
  }
  const report = prepareBrandingModes(options);
  assert.equal(report.files.length, 2);
  for (const entry of report.files) {
    assert.equal(entry.originalMode, 0o664);
    assert.equal(fs.statSync(path.join(options.payload, entry.path)).mode & 0o7777, 0o644);
    assert.equal(
      fs.readFileSync(path.join(options.payload, entry.path), "utf8"),
      `original ${path.basename(entry.path)}`,
    );
  }
  assert.equal(fs.statSync(path.join(folder, "unrelated.png")).mode & 0o7777, 0o664);
});
