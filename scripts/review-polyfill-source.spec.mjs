import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import {
  reconstructPolyfill,
  selectPolyfillInputs,
  verifyPolyfillArchive,
  verifyProductionContent,
} from "./review-polyfill-source.mjs";

const require = createRequire(import.meta.url);
const record = (file, bytes) => ({
  path: file,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
const production = (bytes) => ({
  path: "virtual/node-modules-polyfills/fixture",
  loadedSource: { status: "captured-plugin-load", ...record("fixture", bytes) },
});
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

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

test("production comparison requires exact captured size and hash", () => {
  const bytes = Buffer.from("export {};");
  verifyProductionContent(production(bytes), bytes);
  assert.throws(() => verifyProductionContent(undefined, bytes), /capture/);
  assert.throws(
    () => verifyProductionContent({ loadedSource: { status: "not-captured" } }, bytes),
    /capture/,
  );
  assert.throws(() => verifyProductionContent(production(bytes), Buffer.from("changed!!!")), /SHA-256/);
  assert.throws(() => verifyProductionContent(production(bytes), Buffer.from("short")), /size/);
});

test("production input selection rejects missing, duplicate, unknown, and changed generators", () => {
  const names = ["buffer", "string_decoder", "path", "os", "net", "child_process"];
  const paths = [
    ...names.map((name) => `virtual/node-modules-polyfills/${name}`),
    ...names.map((name) => `virtual/node-modules-polyfills-commonjs/${name}`),
    "virtual/node-modules-polyfills/node:buffer",
    "virtual/node-modules-polyfills-empty/stream",
  ];
  const inputs = paths.map((file) => ({
    path: file,
    loadedSource: {
      plugin: "node-modules-polyfills",
      generator: { sha256: "187f1f1197b169856d7e730a3101487bf01eecbc66fcd191d73699fca5cb4149" },
    },
  }));
  const report = (items) => ({ builds: [{ name: "browser", inputs: items }] });
  assert.equal(selectPolyfillInputs(report(inputs)).length, 14);
  assert.throws(() => selectPolyfillInputs({}), /set changes/);
  assert.throws(() => selectPolyfillInputs(report(inputs.slice(1))), /set changes/);
  assert.throws(() => selectPolyfillInputs(report([...inputs.slice(1), inputs[1]])), /duplicate/);
  assert.throws(
    () =>
      selectPolyfillInputs(
        report([...inputs.slice(1), { ...inputs[0], path: "virtual/node-modules-polyfills/unknown" }]),
      ),
    /unknown/,
  );
  assert.throws(
    () =>
      selectPolyfillInputs(report([{ ...inputs[0], loadedSource: { plugin: "other" } }, ...inputs.slice(1)])),
    /generator/,
  );
});

test("archive comparison verifies integrity and deduplicates equal source records", async () => {
  const bytes = Buffer.from("export {};");
  const input = record("node_modules/@jspm/core/nodelibs/browser/fixture.js", bytes);
  const packed = await archive([{ header: { name: "package/nodelibs/browser/fixture.js" }, bytes }]);
  const result = await verifyPolyfillArchive(packed, integrity(packed), [input, input]);
  assert.equal(result.matchingSourceFiles, 1);
  await assert.rejects(verifyPolyfillArchive(packed, integrity(Buffer.from("other")), [input]), /integrity/);
  await assert.rejects(verifyPolyfillArchive(packed, undefined, [input]), /integrity/);
  await assert.rejects(verifyPolyfillArchive(packed, integrity(packed), []), /No nested/);
  await assert.rejects(
    verifyPolyfillArchive(packed, integrity(packed), [input, { ...input, sha256: "0".repeat(64) }]),
    /Conflicting/,
  );
  await assert.rejects(
    verifyPolyfillArchive(packed, integrity(packed), [
      { ...input, path: "node_modules/@jspm/core/../other.js" },
    ]),
    /Invalid/,
  );
});

test("archive comparison rejects missing, changed, duplicate, and linked source files", async () => {
  const bytes = Buffer.from("export {};");
  const name = "package/nodelibs/browser/fixture.js";
  const input = record("node_modules/@jspm/core/nodelibs/browser/fixture.js", bytes);
  const entry = { header: { name }, bytes };
  for (const entries of [
    [],
    [entry, entry],
    [{ header: { name }, bytes: Buffer.from("changed!!!") }],
    [{ header: { name, type: "symlink", linkname: "other" } }],
  ]) {
    const packed = await archive(entries);
    await assert.rejects(verifyPolyfillArchive(packed, integrity(packed), [input]));
  }
});

test("nested reconstruction matches default output and rejects changed production bytes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-polyfill-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, "entry.js");
  fs.writeFileSync(entry, 'export { value } from "./value.js";\n');
  fs.writeFileSync(path.join(root, "value.js"), "export const value = 42;\n");
  const result = await require("esbuild").build({
    absWorkingDir: root,
    write: false,
    format: "esm",
    bundle: true,
    entryPoints: [entry],
  });
  const generated = Buffer.from(result.outputFiles[0].text.replace(/eval\(/g, "(0,eval)("));
  const options = { root, workingDirectory: root, entry, productionInputs: [production(generated)] };
  const review = await reconstructPolyfill(options);
  assert.equal(review.inputs.length, 2);
  assert.deepEqual(review.externalImports, []);
  await assert.rejects(reconstructPolyfill({ ...options, productionInputs: [] }), /absent/);
  await assert.rejects(
    reconstructPolyfill({ ...options, productionInputs: [production(Buffer.from("wrong"))] }),
    /SHA-256/,
  );
  fs.writeFileSync(path.join(root, "value.js"), "export const value = 43;\n");
  await assert.rejects(reconstructPolyfill(options), /SHA-256/);
});

test("nested reconstruction rejects out-of-workspace and external inputs", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-polyfill-boundary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, "entry.js");
  const options = {
    root,
    workingDirectory: root,
    entry,
    productionInputs: [production(Buffer.from("wrong"))],
  };
  fs.writeFileSync(entry, 'export { value } from "https://example.invalid/polyfill.js";\n');
  await assert.rejects(reconstructPolyfill(options), /external imports/);
  fs.writeFileSync(entry, "export const value = 42;\n");
  await assert.rejects(
    reconstructPolyfill({ ...options, root: path.join(root, "nested") }),
    /outside the workspace/,
  );
});
