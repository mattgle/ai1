import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import {
  boundedFile,
  reviewedGenerators,
  reviewedPackages,
  reviewGeneratorTooling,
  verifyCandidateArchive,
  verifyGeneratorReport,
  verifyResolution,
} from "./review-generator-tooling.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = os.tmpdir();
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const record = (file, bytes) => ({
  path: file,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "ai1-generator-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return target;
}

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

function reportFixture() {
  const names = ["buffer", "string_decoder", "path", "os", "net", "child_process"];
  const paths = [
    ...names.map((name) => `virtual/node-modules-polyfills/${name}`),
    ...names.map((name) => `virtual/node-modules-polyfills-commonjs/${name}`),
    "virtual/node-modules-polyfills/node:buffer",
    "virtual/node-modules-polyfills-empty/stream",
  ];
  const backend = [
    "virtual/node-file/node_modules/drivelist/build/Release/drivelist.node",
    "virtual/node-file/node_modules/keytar/build/Release/keytar.node",
    "virtual/node-file/node_modules/@parcel/watcher-darwin-arm64/watcher.node",
    "virtual/node-file/node_modules/native-keymap/build/Release/keymapping.node",
    "node_modules/bindings/bindings.js",
    "node_modules/@stroncium/procfs/lib/parsers.js",
    "node_modules/node-pty/lib/utils.js",
    "node_modules/@vscode/ripgrep/lib/index.js",
  ];
  return {
    schemaVersion: 1,
    builds: reviewedGenerators.map((generator, index) => ({
      name: generator.build,
      inputs: (index === 0 ? paths : backend).map((file) => ({
        path: file,
        bytes: 0,
        loadedSource: {
          status: "captured-plugin-load",
          plugin: generator.plugin,
          bytes: 0,
          sha256: "0".repeat(64),
          generator: {
            status: "on-disk",
            path: generator.path,
            bytes: generator.bytes,
            sha256: generator.sha256,
            package: {
              name: generator.name,
              version: generator.version,
              path: `node_modules/${generator.name}/package.json`,
            },
          },
        },
      })),
    })),
  };
}

test("selected archive bytes require lockfile integrity before decompression", async () => {
  const bytes = Buffer.from("fixture tooling");
  const records = [record("package/tool.cjs", bytes)];
  const packed = await archive([{ header: { name: records[0].path }, bytes }]);
  const result = await verifyCandidateArchive(packed, integrity(packed), records);
  assert.equal(result.selectedMatches, 1);
  const changed = Buffer.from(packed);
  changed[0] ^= 1;
  await assert.rejects(verifyCandidateArchive(changed, integrity(packed), records), /lockfile/);
  await assert.rejects(verifyCandidateArchive(packed, undefined, records), /integrity/);
  await assert.rejects(verifyCandidateArchive(packed, integrity(packed), []), /No reviewed/);
});

test("archive candidates reject absent, changed, duplicate, linked, and escaping entries", async () => {
  const bytes = Buffer.from("fixture tooling");
  const records = [record("package/tool.cjs", bytes)];
  const entry = { header: { name: records[0].path }, bytes };
  for (const entries of [
    [],
    [entry, entry],
    [{ header: entry.header, bytes: Buffer.from("changed tooling") }],
    [{ header: { ...entry.header, type: "symlink", linkname: "other" } }],
    [{ header: { ...entry.header, type: "link", linkname: "other" } }],
  ]) {
    const packed = await archive(entries);
    await assert.rejects(verifyCandidateArchive(packed, integrity(packed), records));
  }
  const packed = await archive([entry]);
  await assert.rejects(
    verifyCandidateArchive(packed, integrity(packed), [...records, ...records]),
    /duplicate/,
  );
  for (const file of [
    "package/../tool.cjs",
    "../tool.cjs",
    "/package/tool.cjs",
    "package\\tool.cjs",
    "package/./tool.cjs",
    "package//tool.cjs",
    "package/C:tool.cjs",
  ])
    await assert.rejects(
      verifyCandidateArchive(packed, integrity(packed), [{ ...records[0], path: file }]),
      /Invalid/,
    );
});

test("candidate paths reject file links, directory links, wrong types, and escapes", (t) => {
  const root = fixtureRoot(t);
  write(root, "regular/tool.cjs", "throw new Error('must not execute');");
  assert.equal(boundedFile(root, "regular/tool.cjs"), path.join(root, "regular/tool.cjs"));
  fs.symlinkSync("regular/tool.cjs", path.join(root, "linked.cjs"));
  fs.symlinkSync("regular", path.join(root, "linked-directory"));
  assert.throws(() => boundedFile(path.join(root, "linked-directory"), "tool.cjs"), /regular candidate root/);
  for (const file of ["linked.cjs", "linked-directory/tool.cjs", "regular"])
    assert.throws(() => boundedFile(root, file), /linked|type/);
  for (const file of [
    "../outside",
    "/outside",
    "regular/../regular/tool.cjs",
    "regular\\tool.cjs",
    "",
    "regular//tool.cjs",
  ])
    assert.throws(() => boundedFile(root, file), /Invalid/);
  assert.throws(() => boundedFile(root, "missing.cjs"), /ENOENT/);
  const oversized = write(root, "oversized.cjs", "fixture");
  fs.truncateSync(oversized, 16 * 1024 * 1024 + 1);
  assert.throws(() => boundedFile(root, "oversized.cjs"), /byte limit/);
});

test("parent-relative resolution selects nested candidates without executing them", (t) => {
  const root = fixtureRoot(t);
  const parent = "node_modules/mlly/dist/index.cjs";
  const nested = "node_modules/mlly/node_modules/pkg-types/index.cjs";
  const top = "node_modules/pkg-types/index.cjs";
  for (const file of [parent, nested, top]) write(root, file, "throw new Error('must not execute');");
  for (const folder of ["node_modules/pkg-types", "node_modules/mlly/node_modules/pkg-types"])
    write(root, `${folder}/package.json`, JSON.stringify({ name: "pkg-types", main: "index.cjs" }));
  assert.equal(verifyResolution(root, parent, "pkg-types", nested).resolved, nested);
  assert.throws(() => verifyResolution(root, parent, "pkg-types", top), /resolution changes/);
  fs.unlinkSync(path.join(root, nested));
  fs.symlinkSync(path.join(root, top), path.join(root, nested));
  assert.throws(() => verifyResolution(root, parent, "pkg-types", nested), /linked/);
  assert.throws(() => verifyResolution(root, parent, "pkg-types", "../outside"), /Invalid/);
});

test("generator checks reject local mutation, changed identity, capture drift, and duplicate builds", (t) => {
  const root = fixtureRoot(t);
  for (const generator of reviewedGenerators)
    write(root, generator.path, fs.readFileSync(path.join(workspace, generator.path)));
  const report = reportFixture();
  assert.equal(verifyGeneratorReport(root, report).length, 2);
  const mutated = JSON.parse(JSON.stringify(report));
  mutated.builds[1].inputs[0].loadedSource.generator.sha256 = "0".repeat(64);
  assert.throws(() => verifyGeneratorReport(root, mutated), /identity/);
  for (const mutate of [
    (value) => value.builds[1].inputs.pop(),
    (value) => value.builds[1].inputs.push(value.builds[1].inputs[0]),
    (value) => value.builds[1].inputs.push({ path: value.builds[1].inputs[0].path }),
    (value) => {
      value.builds[1].inputs[0].path = value.builds[1].inputs[1].path;
    },
    (value) => {
      value.builds[1].inputs[0].path = "virtual/node-file/unreviewed";
    },
    (value) => {
      value.builds[1].inputs[0].loadedSource.generator.package.path = "node_modules/other/package.json";
    },
    (value) => {
      value.builds[1].inputs[0].loadedSource.status = "not-captured";
    },
    (value) => {
      value.builds[1].inputs[0].loadedSource.bytes = 1;
    },
    (value) => value.builds.push(value.builds[0]),
  ]) {
    const changed = JSON.parse(JSON.stringify(report));
    mutate(changed);
    assert.throws(() => verifyGeneratorReport(root, changed));
  }
  const generator = reviewedGenerators[0];
  const bytes = fs.readFileSync(path.join(root, generator.path));
  bytes[0] ^= 1;
  write(root, generator.path, bytes);
  assert.throws(() => verifyGeneratorReport(root, report), /SHA-256/);
});

test(
  "full offline review preserves production assertions with synthetic archives",
  {
    skip:
      process.platform !== "darwin" || process.arch !== "arm64" ? "Only darwin-arm64 is reviewed." : false,
  },
  async (t) => {
    const root = fixtureRoot(t);
    const archives = path.join(root, "archives");
    fs.mkdirSync(archives);
    const lock = { packages: {} };
    const host = {
      path: "node_modules/@esbuild/darwin-arm64",
      name: "@esbuild/darwin-arm64",
      version: "0.28.2",
      files: ["bin/esbuild", "package.json"],
    };
    for (const entry of [...reviewedPackages, host]) {
      const entries = entry.files.map((file) => {
        const bytes = fs.readFileSync(path.join(workspace, entry.path, file));
        write(root, `${entry.path}/${file}`, bytes);
        return { header: { name: `package/${file}` }, bytes };
      });
      const packed = await archive(entries);
      const filename = `${entry.name.split("/").at(-1)}-${entry.version}.tgz`;
      write(archives, filename, packed);
      lock.packages[entry.path] = {
        version: entry.version,
        resolved: `https://registry.npmjs.org/${entry.name}/-/${filename}`,
        integrity: integrity(packed),
      };
    }
    for (const file of [
      "applications/electron/esbuild.mjs",
      "applications/electron/gen-esbuild.browser.mjs",
      "scripts/dompurify-build-plugin.cjs",
    ])
      write(root, file, fs.readFileSync(path.join(workspace, file)));
    const lockfile = write(root, "package-lock.json", JSON.stringify(lock));
    const reportFile = write(root, "build-inputs.json", JSON.stringify(reportFixture()));
    const result = await reviewGeneratorTooling(root, archives, reportFile);
    assert.equal(result.selectedFiles, 59);
    assert.equal(result.packageArchives, 19);
    assert.equal(result.staticModuleCandidates, 33);
    assert.equal(result.hostEsbuild.executed, false);
    assert.equal(result.sanitizerGenerator.productionReportIdentity, "not-recorded");
    assert.equal(result.unresolved.length, 2);
    assert.ok(
      result.resolutions.some(
        (entry) => entry.specifier === "confbox" && entry.resolved.includes("mlly/node_modules/confbox"),
      ),
    );

    await t.test("linked report and archive roots fail", async () => {
      const linkedArchives = path.join(root, "linked-archives");
      fs.symlinkSync("archives", linkedArchives);
      await assert.rejects(
        reviewGeneratorTooling(root, linkedArchives, reportFile),
        /regular input directory/,
      );
      const linkedReport = path.join(root, "linked-report.json");
      fs.symlinkSync("build-inputs.json", linkedReport);
      await assert.rejects(reviewGeneratorTooling(root, archives, linkedReport), /linked/);
    });

    await t.test("nested lock entry and manifest identities remain mandatory", async () => {
      const key = "node_modules/mlly/node_modules/pkg-types";
      const original = lock.packages[key];
      delete lock.packages[key];
      fs.writeFileSync(lockfile, JSON.stringify(lock));
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /nested lockfile/);
      lock.packages[key] = original;
      fs.writeFileSync(lockfile, JSON.stringify(lock));
      const file = path.join(root, key, "package.json");
      const bytes = fs.readFileSync(file);
      const manifest = JSON.parse(bytes);
      manifest.name = "confbox";
      fs.writeFileSync(file, JSON.stringify(manifest));
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /manifest/);
      fs.writeFileSync(file, bytes);
    });

    await t.test("candidate mutation and archive links fail", async () => {
      const file = path.join(root, "node_modules/mlly/node_modules/confbox/dist/index.cjs");
      const bytes = fs.readFileSync(file);
      fs.writeFileSync(file, Buffer.alloc(bytes.length));
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /SHA-256/);
      fs.writeFileSync(file, bytes);
      const archiveFile = path.join(archives, "confbox-0.1.8.tgz");
      const archiveBytes = fs.readFileSync(archiveFile);
      fs.unlinkSync(archiveFile);
      fs.symlinkSync("mlly-1.8.2.tgz", archiveFile);
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /linked/);
      fs.unlinkSync(archiveFile);
      fs.writeFileSync(archiveFile, archiveBytes);
    });

    await t.test("unreviewed registry and present pnpapi fail", async () => {
      const entry = lock.packages["node_modules/mlly"];
      const url = entry.resolved;
      entry.resolved = "https://example.invalid/mlly-1.8.2.tgz";
      fs.writeFileSync(lockfile, JSON.stringify(lock));
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /archive URL/);
      entry.resolved = url;
      fs.writeFileSync(lockfile, JSON.stringify(lock));
      write(root, "node_modules/pnpapi/index.js", "throw new Error('must not execute');");
      await assert.rejects(reviewGeneratorTooling(root, archives, reportFile), /unreviewed pnpapi/);
    });
  },
);
