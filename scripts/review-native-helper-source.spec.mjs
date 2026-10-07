import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import { nativeHelperInputs, reviewNativeHelperSource } from "./review-native-helper-source.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function archive(entries) {
  const pack = tar.pack();
  const chunks = [];
  pack.on("data", (chunk) => chunks.push(chunk));
  const ended = once(pack, "end");
  for (const entry of entries) pack.entry(entry.header, entry.bytes);
  pack.finalize();
  await ended;
  return gzipSync(Buffer.concat(chunks));
}

async function fixture(t, platform = "linux", arch = "x64") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-native-source-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "app");
  const archives = path.join(root, "archives");
  fs.mkdirSync(archives);
  const files = [
    {
      path: "lib/backend/native/rg",
      package: `@vscode/ripgrep-${platform}-${arch}`,
      source: "bin/rg",
      mode: 0o755,
    },
    {
      path: `lib/prebuilds/${platform}-${arch}/pty.node`,
      package: "node-pty",
      source: `prebuilds/${platform}-${arch}/pty.node`,
      mode: 0o644,
    },
    ...(platform === "darwin"
      ? [
          { path: "lib/backend/macos-trash", package: "trash", source: "lib/macos-trash", mode: 0o755 },
          {
            path: "lib/prebuilds/darwin-arm64/spawn-helper",
            package: "node-pty",
            source: "prebuilds/darwin-arm64/spawn-helper",
            mode: 0o755,
          },
        ]
      : []),
  ];
  const report = {
    platform,
    arch,
    files: files.map((entry) => {
      const bytes = Buffer.from(`original ${entry.path}`);
      const file = path.join(payload, entry.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      fs.chmodSync(file, entry.mode);
      return { path: entry.path, bytes: bytes.length, sha256: hash(bytes), packagedMode: entry.mode };
    }),
  };
  const manifest = path.join(payload, "resources/release/native-helpers.json");
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, JSON.stringify(report));
  const packages = {};
  for (const name of [...new Set(files.map((entry) => entry.package))]) {
    const folder = path.join(payload, "node_modules", name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    const pack = tar.pack();
    const chunks = [];
    pack.on("data", (chunk) => chunks.push(chunk));
    const ended = once(pack, "end");
    for (const entry of files.filter((entry) => entry.package === name)) {
      pack.entry({ name: `package/${entry.source}` }, fs.readFileSync(path.join(payload, entry.path)));
    }
    pack.finalize();
    await ended;
    const bytes = gzipSync(Buffer.concat(chunks));
    const archive = `${name.split("/").at(-1)}-1.0.0.tgz`;
    fs.writeFileSync(path.join(archives, archive), bytes);
    packages[`node_modules/${name}`] = {
      version: "1.0.0",
      resolved: `https://registry.npmjs.org/${archive}`,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
  }
  const lockfile = path.join(root, "package-lock.json");
  fs.writeFileSync(lockfile, JSON.stringify({ packages }));
  return { root, payload, archives, manifest, report, lockfile, packages };
}

for (const [platform, arch] of [
  ["linux", "x64"],
  ["darwin", "arm64"],
]) {
  test(`${platform} helper review matches copied bytes to local exact archives without changes`, async (t) => {
    const options = await fixture(t, platform, arch);
    const result = await reviewNativeHelperSource(options.payload, options.lockfile, options.archives);
    assert.equal(result.packages.flatMap((entry) => entry.files).length, platform === "darwin" ? 4 : 2);
    assert.equal(JSON.stringify(result).includes(options.root), false);
    assert.equal(fs.readFileSync(options.manifest, "utf8"), JSON.stringify(options.report));
  });
}

test("native helper inventory rejects missing, duplicate, unknown, and unsafe records", async (t) => {
  const { report } = await fixture(t);
  assert.throws(() => nativeHelperInputs({ ...report, arch: "arm64" }), /target/);
  assert.throws(() => nativeHelperInputs({ ...report, files: report.files.slice(1) }), /inventory/);
  assert.throws(
    () => nativeHelperInputs({ ...report, files: [report.files[0], report.files[0]] }),
    /Duplicate/,
  );
  for (const replacement of [
    { path: "../outside" },
    { bytes: -1 },
    { bytes: 32 * 1024 * 1024 },
    { sha256: "wrong" },
    { packagedMode: 0o777 },
  ]) {
    assert.throws(
      () =>
        nativeHelperInputs({ ...report, files: [{ ...report.files[0], ...replacement }, report.files[1]] }),
      /Invalid/,
    );
  }
});

test("helper review rejects changed payload bytes and modes", async (t) => {
  const options = await fixture(t);
  const file = path.join(options.payload, options.report.files[0].path);
  fs.chmodSync(file, 0o777);
  await assert.rejects(reviewNativeHelperSource(options.payload, options.lockfile, options.archives), /mode/);
  fs.chmodSync(file, 0o755);
  fs.writeFileSync(file, "changed");
  await assert.rejects(
    reviewNativeHelperSource(options.payload, options.lockfile, options.archives),
    /SHA-256/,
  );
});

test("helper review rejects linked payload files and escaping parent directories", async (t) => {
  const options = await fixture(t);
  const file = path.join(options.payload, options.report.files[0].path);
  const outside = path.join(options.root, "outside");
  fs.copyFileSync(file, outside);
  fs.unlinkSync(file);
  fs.symlinkSync(outside, file);
  await assert.rejects(
    reviewNativeHelperSource(options.payload, options.lockfile, options.archives),
    /linked/,
  );
  fs.unlinkSync(file);
  fs.rmdirSync(path.dirname(file));
  const directory = path.join(options.root, "external-native");
  fs.mkdirSync(directory);
  fs.copyFileSync(outside, path.join(directory, "rg"));
  fs.symlinkSync(directory, path.dirname(file));
  await assert.rejects(
    reviewNativeHelperSource(options.payload, options.lockfile, options.archives),
    /outside/,
  );
});

test("helper review rejects archive integrity, metadata, registry, and missing archive mismatches", async (t) => {
  const options = await fixture(t);
  const name = "@vscode/ripgrep-linux-x64";
  const locked = options.packages[`node_modules/${name}`];
  const original = { ...locked };
  for (const replacement of [
    { integrity: "sha512-invalid" },
    { resolved: "https://example.invalid/fixture.tgz" },
    { resolved: "https://registry.npmjs.org/%2e%2e.tgz" },
    { version: "2.0.0" },
    { resolved: "https://registry.npmjs.org/missing.tgz" },
  ]) {
    Object.assign(locked, original, replacement);
    fs.writeFileSync(options.lockfile, JSON.stringify({ packages: options.packages }));
    await assert.rejects(reviewNativeHelperSource(options.payload, options.lockfile, options.archives));
  }
});

test("helper review rejects absent, duplicate, linked, and changed selected archive entries after integrity", async (t) => {
  const options = await fixture(t);
  const locked = options.packages["node_modules/@vscode/ripgrep-linux-x64"];
  const file = path.join(options.archives, "ripgrep-linux-x64-1.0.0.tgz");
  const bytes = fs.readFileSync(path.join(options.payload, "lib/backend/native/rg"));
  const entry = { header: { name: "package/bin/rg" }, bytes };
  for (const entries of [
    [],
    [entry, entry],
    [{ header: { name: "package/bin/rg", type: "symlink", linkname: "outside" } }],
    [{ header: { name: "package/bin/rg" }, bytes: Buffer.alloc(bytes.length, 120) }],
  ]) {
    const packed = await archive(entries);
    fs.writeFileSync(file, packed);
    locked.integrity = `sha512-${createHash("sha512").update(packed).digest("base64")}`;
    fs.writeFileSync(options.lockfile, JSON.stringify({ packages: options.packages }));
    await assert.rejects(reviewNativeHelperSource(options.payload, options.lockfile, options.archives));
  }
});
