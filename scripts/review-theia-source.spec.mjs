import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import {
  compareFile,
  contributingTheiaInputs,
  reviewTheiaSource,
  verifyArchive,
  sourceReviewHasGaps,
} from "./review-theia-source.mjs";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";

const buildReport = (files) => ({
  schemaVersion: 1,
  builds: [
    {
      inputs: files.map((file) => ({
        path: `node_modules/@theia/core/${file}`,
        package: { name: "@theia/core", version: "1.75.0", path: "node_modules/@theia/core/package.json" },
      })),
      outputs: [
        { inputs: files.map((file) => ({ path: `node_modules/@theia/core/${file}`, bytesInOutput: 10 })) },
      ],
    },
  ],
});

test("Theia input coverage uses contributing paths and rejects missing or escaping metadata", () => {
  const report = buildReport(["lib/equal.js", "lib/unused.js"]);
  report.builds[0].outputs[0].inputs[1].bytesInOutput = 0;
  assert.deepEqual([...contributingTheiaInputs(report).get("@theia/core")], ["lib/equal.js"]);
  for (const file of ["../escape.js", "lib\\escape.js"])
    assert.throws(() => contributingTheiaInputs(buildReport([file])), /Invalid Theia/);
  report.builds[0].inputs = [];
  assert.throws(() => contributingTheiaInputs(report), /no metadata/);
  const wrong = buildReport(["lib/file.js"]);
  wrong.builds[0].inputs[0].package.path = "node_modules/other/package.json";
  assert.throws(() => contributingTheiaInputs(wrong), /does not match/);
  assert.throws(() => contributingTheiaInputs(buildReport([])), /No contributing/);
  const duplicate = buildReport(["lib/file.js", "lib/file.js"]);
  assert.throws(() => contributingTheiaInputs(duplicate), /Duplicate/);
  for (const bytes of [-1, "10", null]) {
    const invalid = buildReport(["lib/file.js"]);
    invalid.builds[0].outputs[0].inputs[0].bytesInOutput = bytes;
    assert.throws(() => contributingTheiaInputs(invalid), /Invalid input byte/);
  }
});

test("source review gaps include non-source contributing files and unknown status values", () => {
  for (const status of ["changed", "absent", "outside-checked-archive-files", "unknown"])
    assert.equal(
      sourceReviewHasGaps({ packages: [{ changed: [], buildInputs: [{ path: "package.json", status }] }] }),
      true,
    );
  assert.equal(
    sourceReviewHasGaps({
      packages: [{ changed: [], buildInputs: [{ path: "lib/file.js", status: "equal" }] }],
    }),
    false,
  );
  assert.equal(sourceReviewHasGaps({ packages: [{ changed: ["lib/file.js"] }] }), true);
});

test("Theia source coverage keeps changed, absent, and unreviewed build inputs visible", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-source-coverage-"));
  try {
    const folder = path.join(root, "node_modules/@theia/core");
    fs.mkdirSync(path.join(folder, "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "@theia/core", version: "1.75.0" }),
    );
    fs.writeFileSync(path.join(folder, "lib/equal.js"), "Original source");
    fs.writeFileSync(path.join(folder, "lib/changed.js"), "Changed source");
    fs.writeFileSync(path.join(folder, "theme.json"), "Published theme");
    const pack = tar.pack();
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      pack.on("data", (chunk) => chunks.push(chunk));
      pack.on("end", resolve);
      pack.on("error", reject);
    });
    for (const file of ["equal.js", "changed.js", "absent.js"])
      pack.entry({ name: `package/lib/${file}` }, "Original source");
    pack.entry({ name: "package/theme.json" }, "Published theme");
    pack.finalize();
    await done;
    const archive = gzipSync(Buffer.concat(chunks));
    context.mock.method(globalThis, "fetch", async () => ({ ok: true, arrayBuffer: async () => archive }));
    const lockfile = path.join(root, "package-lock.json");
    fs.writeFileSync(
      lockfile,
      JSON.stringify({
        packages: {
          "node_modules/@theia/core": {
            version: "1.75.0",
            resolved: "https://registry.npmjs.org/fixture.tgz",
            integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
          },
        },
      }),
    );
    const evidence = path.join(root, "build-inputs.json");
    fs.writeFileSync(
      evidence,
      JSON.stringify(
        buildReport(["lib/equal.js", "lib/changed.js", "lib/absent.js", "lib/added.js", "theme.json"]),
      ),
    );
    const report = await reviewTheiaSource(root, lockfile, evidence);
    assert.deepEqual(report.packages[0].buildInputs, [
      { path: "lib/absent.js", status: "absent" },
      { path: "lib/added.js", status: "outside-checked-archive-files" },
      { path: "lib/changed.js", status: "changed" },
      { path: "lib/equal.js", status: "equal" },
      { path: "theme.json", status: "equal" },
    ]);
    assert.equal(report.packages[0].equal, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
