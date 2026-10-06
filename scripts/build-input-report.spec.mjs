import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { test } from "node:test";
import { buildInputReport } from "./build-input-report.mjs";
import sanitizerPlugin from "./dompurify-build-plugin.cjs";

test("sanitizer evidence records the exact loaded transformation and rejects inconsistent inputs", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-transformed-evidence-")));
  try {
    const original = path.join(
      root,
      "node_modules/@theia/monaco-editor-core/esm/vs/base/browser/dompurify/dompurify.js",
    );
    const replacement = path.join(root, "node_modules/dompurify/index.js");
    fs.mkdirSync(path.dirname(original), { recursive: true });
    fs.mkdirSync(path.dirname(replacement), { recursive: true });
    fs.writeFileSync(original, 'throw new Error("Old sanitizer");');
    fs.writeFileSync(replacement, 'export default function factory() { return { version: "fixed" }; }');
    fs.writeFileSync(
      path.join(root, "node_modules/dompurify/package.json"),
      JSON.stringify({ name: "dompurify", version: "3.4.16" }),
    );
    fs.writeFileSync(
      path.join(root, "entry.js"),
      `import sanitizer from ${JSON.stringify(original)}; console.log(sanitizer);`,
    );
    const transformations = [];
    const result = await build({
      absWorkingDir: root,
      entryPoints: ["entry.js"],
      outfile: "bundle.js",
      bundle: true,
      metafile: true,
      plugins: [sanitizerPlugin.dompurifyBuildPlugin(replacement, (record) => transformations.push(record))],
    });
    const run = (records) =>
      buildInputReport(
        [{ name: "browser", metafile: result.metafile, transformations: records }],
        root,
        root,
      );
    const report = run(transformations);
    const evidence = report.builds[0].transformations[0];
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    assert.equal(evidence.original.sha256, hash(fs.readFileSync(original)));
    assert.equal(evidence.transformed.sha256, hash(transformations[0].contents));
    assert.equal(evidence.transformed.contents, transformations[0].contents);
    assert.equal(evidence.replacement.sha256, hash(fs.readFileSync(replacement)));
    assert.equal(evidence.replacement.package.name, "dompurify");
    assert.equal(JSON.stringify(report).includes(root), false);
    assert.throws(() => run([...transformations, ...transformations]), /Duplicate/);
    assert.throws(() => run([{ ...transformations[0], path: "/outside/file.js" }]), /escapes/);
    assert.throws(
      () => run([{ ...transformations[0], replacementPath: path.join(root, "unknown.js") }]),
      /absent/,
    );
    assert.throws(() => run([{ ...transformations[0], contents: "Changed source" }]), /bytes do not match/);
    assert.throws(() => run([{ ...transformations[0], contents: root }]), /local path/);
    assert.throws(() => run([{ ...transformations[0], original: "not bytes" }]), /Invalid/);
    assert.ok(fs.readFileSync(original).equals(transformations[0].original));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("virtual native inputs keep dependency identity without local absolute paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-virtual-evidence-"));
  try {
    const folder = path.join(root, "node_modules/native-fixture");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "native-fixture", version: "2.0.0" }),
    );
    fs.writeFileSync(path.join(root, "bundle.js"), "Generated bundle");
    const native = `node-file:${path.join(folder, "binding.node")}`;
    const metafile = {
      inputs: { [native]: { bytes: 10 }, "polyfill:fs": { bytes: 2 } },
      outputs: { "bundle.js": { inputs: { [native]: { bytesInOutput: 10 } }, imports: [] } },
    };
    const report = buildInputReport([{ name: "node", metafile }], root, root);
    assert.equal(JSON.stringify(report).includes(root), false);
    assert.equal(
      report.builds[0].inputs[0].path,
      "virtual/node-file/node_modules/native-fixture/binding.node",
    );
    assert.equal(report.builds[0].inputs[0].package.name, "native-fixture");
    assert.equal(report.builds[0].inputs[1].package, null);
    metafile.inputs = { "node-file:/outside/binding.node": { bytes: 1 } };
    assert.throws(() => buildInputReport([{ name: "node", metafile }], root, root), /escapes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("build evidence records actual bundle inputs, versions, and output hashes without local paths", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-build-evidence-"));
  try {
    const dependency = path.join(root, "node_modules/fixture");
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.2.3", main: "index.js" }),
    );
    fs.writeFileSync(path.join(dependency, "index.js"), "export const value = 7;\n");
    fs.writeFileSync(
      path.join(root, "entry.js"),
      'import { value } from "fixture"; import fs from "node:fs"; console.log(value, fs);',
    );
    const result = await build({
      absWorkingDir: root,
      entryPoints: ["entry.js"],
      outfile: "bundle.js",
      platform: "node",
      bundle: true,
      metafile: true,
    });
    const report = buildInputReport([{ name: "node", metafile: result.metafile }], root, root);
    const output = report.builds[0].outputs[0];
    assert.equal(
      output.sha256,
      createHash("sha256")
        .update(fs.readFileSync(path.join(root, "bundle.js")))
        .digest("hex"),
    );
    assert.ok(
      output.inputs.some(
        (input) => input.path === "node_modules/fixture/index.js" && input.bytesInOutput > 0,
      ),
    );
    assert.deepEqual(report.builds[0].inputs.find((input) => input.package)?.package, {
      name: "fixture",
      version: "1.2.3",
      path: "node_modules/fixture/package.json",
    });
    assert.ok(output.externalImports.some((input) => input.path === "node:fs"));
    assert.equal(JSON.stringify(report).includes(root), false);
    assert.throws(() =>
      buildInputReport(
        [
          {
            name: "node",
            metafile: { inputs: {}, outputs: { "../outside.js": { inputs: {}, imports: [] } } },
          },
        ],
        root,
        root,
      ),
    );
    assert.throws(() => buildInputReport([{ name: "node" }], root, root), /metadata is missing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
