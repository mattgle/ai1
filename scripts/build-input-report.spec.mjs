import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { build, context } from "esbuild";
import { test } from "node:test";
import {
  assertLoadedBuildInputsCaptured,
  buildInputReport,
  captureBuildPlugin,
} from "./build-input-report.mjs";
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
    const originalInput = report.builds[0].inputs.find((input) => input.path === evidence.path);
    assert.equal(originalInput.source.sha256, evidence.original.sha256);
    assert.equal(originalInput.source.bytes, evidence.original.bytes);
    assert.notEqual(originalInput.source.bytes, originalInput.bytes);
    assert.equal(originalInput.loadedSource.status, "captured-transformation");
    assert.equal(originalInput.loadedSource.sha256, evidence.transformed.sha256);
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

test("build source hashes reject missing files and linked inputs outside the repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-source-hash-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-outside-source-"));
  try {
    fs.writeFileSync(path.join(root, "bundle.js"), "Bundle");
    fs.writeFileSync(path.join(outside, "external.js"), "External source");
    const metafile = {
      inputs: { "input.js": { bytes: 1 } },
      outputs: { "bundle.js": { inputs: {}, imports: [] } },
    };
    const run = () => buildInputReport([{ name: "node", metafile }], root, root);
    assert.throws(run, /ENOENT/);
    fs.symlinkSync(path.join(outside, "external.js"), path.join(root, "input.js"));
    assert.throws(run, /escapes/);
    assert.equal(fs.readFileSync(path.join(outside, "external.js"), "utf8"), "External source");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
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
    fs.writeFileSync(path.join(folder, "binding.node"), "Native binary fixture");
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
    assert.equal(report.builds[0].inputs[0].source.status, "on-disk");
    assert.equal(report.builds[0].inputs[0].source.bytes, 21);
    assert.equal(report.builds[0].inputs[0].loadedSource.status, "not-captured");
    assert.match(report.builds[0].inputs[0].loadedSource.reason, /referenced disk file/);
    assert.equal(report.builds[0].inputs[1].source.status, "not-captured");
    metafile.inputs = { "node-file:/outside/binding.node": { bytes: 1 } };
    assert.throws(() => buildInputReport([{ name: "node", metafile }], root, root), /escapes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CSS asset URLs retain their suffix and hash the exact on-disk font source", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-css-source-"));
  try {
    fs.writeFileSync(path.join(root, "font.woff"), "Font source fixture");
    fs.writeFileSync(
      path.join(root, "style.css"),
      '@font-face { font-family: fixture; src: url("./font.woff?v=1.0.0#font"); }',
    );
    const result = await build({
      absWorkingDir: root,
      entryPoints: ["style.css"],
      outdir: "dist",
      bundle: true,
      metafile: true,
      loader: { ".woff": "file" },
    });
    const report = buildInputReport([{ name: "browser", metafile: result.metafile }], root, root);
    const font = report.builds[0].inputs.find((input) => input.path.startsWith("font.woff"));
    assert.equal(font.path, "font.woff?v=1.0.0#font");
    assert.equal(font.source.path, "font.woff");
    assert.equal(
      font.source.sha256,
      createHash("sha256")
        .update(fs.readFileSync(path.join(root, "font.woff")))
        .digest("hex"),
    );
    assert.equal(JSON.stringify(report).includes(root), false);
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
    const input = report.builds[0].inputs.find((input) => input.path === "node_modules/fixture/index.js");
    assert.equal(input.source.status, "on-disk");
    assert.equal(
      input.source.sha256,
      createHash("sha256")
        .update(fs.readFileSync(path.join(dependency, "index.js")))
        .digest("hex"),
    );
    assert.equal(input.source.bytes, fs.statSync(path.join(dependency, "index.js")).size);
    assert.equal(input.loadedSource.status, "not-captured");
    assert.match(input.loadedSource.reason, /same-size transformation/);
    assert.equal(
      output.externalImports.find((entry) => entry.path === "node:fs").source.kind,
      "node-runtime",
    );
    assert.throws(() => assertLoadedBuildInputsCaptured(report), /unverified/);
    assert.match(report.sourceHashScope, /report time/);
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

test("plugin capture records exact generated bytes and resets each rebuild without changing load results", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-plugin-capture-")));
  let buildContext;
  try {
    const generator = path.join(root, "generator.js");
    fs.writeFileSync(generator, "Generator fixture");
    fs.writeFileSync(path.join(root, "entry.js"), 'import { value } from "generated"; console.log(value);');
    let value = 7;
    const loadedSources = [];
    const plugin = {
      name: "fixture-generator",
      setup(build) {
        build.onResolve({ filter: /^generated$/ }, () => ({ path: "fixture", namespace: "generated" }));
        build.onLoad({ filter: /.*/, namespace: "generated" }, () => ({
          contents: `export const value = ${value};`,
          loader: "js",
          resolveDir: root,
          watchFiles: [generator],
        }));
        build.onLoad({ filter: /entry\.js$/, namespace: "file" }, (args) => ({
          contents: fs.readFileSync(args.path),
          loader: "js",
        }));
      },
    };
    buildContext = await context({
      absWorkingDir: root,
      entryPoints: ["entry.js"],
      outfile: "bundle.js",
      bundle: true,
      metafile: true,
      plugins: [captureBuildPlugin(plugin, loadedSources, generator)],
    });
    const run = async () => {
      const result = await buildContext.rebuild();
      return buildInputReport([{ name: "browser", metafile: result.metafile, loadedSources }], root, root);
    };

    // Check the captured content and the actual bundle from the same callback result.
    const first = await run();
    const generated = first.builds[0].inputs.find((input) => input.path === "virtual/generated/fixture");
    assert.equal(generated.source.status, "not-captured");
    assert.equal(generated.loadedSource.status, "captured-plugin-load");
    assert.equal(
      generated.loadedSource.sha256,
      createHash("sha256").update("export const value = 7;").digest("hex"),
    );
    assert.equal(generated.loadedSource.generator.path, "generator.js");
    assert.match(generated.loadedSource.dependencyScope, /not captured/);
    assert.equal(JSON.stringify(first).includes(root), false);
    assert.equal(loadedSources.length, 2);
    assert.match(fs.readFileSync(path.join(root, "bundle.js"), "utf8"), /value = 7/);
    assert.match(assertLoadedBuildInputsCaptured(first).scope, /does not verify/);

    // Repeat with a same-size change so byte counts cannot hide changed content.
    value = 8;
    const second = await run();
    const changed = second.builds[0].inputs.find((input) => input.path === generated.path);
    assert.equal(loadedSources.length, 2);
    assert.equal(changed.loadedSource.bytes, generated.loadedSource.bytes);
    assert.notEqual(changed.loadedSource.sha256, generated.loadedSource.sha256);
    assert.match(fs.readFileSync(path.join(root, "bundle.js"), "utf8"), /value = 8/);
  } finally {
    await buildContext?.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plugin load records reject duplicates, mismatched bytes, and a changed generator", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-load-record-"));
  try {
    const generatorPath = path.join(root, "generator.js");
    fs.writeFileSync(generatorPath, "Generator");
    fs.writeFileSync(path.join(root, "bundle.js"), "Bundle");
    const metafile = {
      inputs: { "generated:fixture": { bytes: 6 } },
      outputs: { "bundle.js": { inputs: { "generated:fixture": { bytesInOutput: 6 } }, imports: [] } },
    };
    const record = {
      path: "generated:fixture",
      contents: Buffer.from("Loaded"),
      plugin: "fixture",
      loader: "js",
      generatorPath,
      generator: fs.readFileSync(generatorPath),
    };
    const run = (loadedSources) =>
      buildInputReport([{ name: "browser", metafile, loadedSources }], root, root);
    assert.equal(run([record]).builds[0].inputs[0].loadedSource.status, "captured-plugin-load");
    assert.throws(() => run([record, record]), /Duplicate/);
    assert.throws(() => run([{ ...record, path: "generated:absent" }]), /absent/);
    assert.throws(() => run([{ ...record, contents: Buffer.from("Changed") }]), /bytes do not match/);
    assert.throws(() => run([{ ...record, generator: "not bytes" }]), /Invalid/);
    assert.throws(() => run([{ ...record, plugin: root }]), /local path/);
    assert.throws(() => run([{ ...record, generatorPath: "/outside/generator.js" }]), /escapes/);
    fs.writeFileSync(generatorPath, "Changed generator");
    assert.throws(() => run([record]), /generator changes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plugin capture preserves callback results, suffixes, and copied byte snapshots", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-load-callback-"));
  try {
    const generator = path.join(root, "generator.js");
    fs.writeFileSync(generator, "Generator");
    const loadedSources = [];
    let start;
    let load;
    let result = { contents: new Uint8Array([1, 2, 3]), loader: "js", watchFiles: [generator] };
    const plugin = captureBuildPlugin(
      {
        name: "fixture",
        setup(build) {
          build.onLoad({ filter: /.*/, namespace: "generated" }, () => result);
        },
      },
      loadedSources,
      generator,
    );
    plugin.setup({
      onStart(callback) {
        start = callback;
      },
      onLoad(_options, callback) {
        load = callback;
      },
    });
    start();
    const args = { namespace: "generated", path: "fixture", suffix: "?version=1" };
    assert.equal(await load(args), result);
    assert.equal(loadedSources[0].path, "generated:fixture?version=1");
    result.contents[0] = 9;
    assert.deepEqual(loadedSources[0].contents, Buffer.from([1, 2, 3]));
    result = { errors: [{ text: "Fixture error" }] };
    assert.equal(await load(args), result);
    assert.equal(loadedSources.length, 1);
    result = { contents: 7 };
    await assert.rejects(load(args), /Invalid loaded/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("same-size disk inputs and external loads do not pass the loaded-source gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-load-gap-"));
  try {
    fs.writeFileSync(path.join(root, "input.js"), "Source");
    fs.writeFileSync(path.join(root, "bundle.js"), "Bundle");
    const metafile = {
      inputs: { "input.js": { bytes: 6 } },
      outputs: {
        "bundle.js": {
          inputs: { "input.js": { bytesInOutput: 6 } },
          imports: [
            { path: "electron", kind: "require-call", external: true },
            { path: "optional-module", kind: "dynamic-import", external: true },
          ],
        },
      },
    };
    const report = buildInputReport([{ name: "node", metafile }], root, root);
    assert.equal(report.builds[0].inputs[0].loadedSource.status, "not-captured");
    assert.match(report.builds[0].inputs[0].loadedSource.reason, /same-size/);
    assert.deepEqual(
      report.builds[0].outputs[0].externalImports.map((entry) => entry.source.kind),
      ["electron-runtime", "external-load"],
    );
    assert.throws(() => assertLoadedBuildInputsCaptured(report), /unverified/);
    report.builds[0].inputs[0].loadedSource = {
      bytes: 6,
      sha256: createHash("sha256").update("Loaded").digest("hex"),
    };
    assert.throws(() => assertLoadedBuildInputsCaptured(report), /unverified/);
    report.builds[0].outputs[0].externalImports = [];
    assert.throws(() => assertLoadedBuildInputsCaptured(report), /unverified/);
    const duplicate = { ...metafile, inputs: { "input.js": { bytes: 6 }, "./input.js": { bytes: 6 } } };
    assert.throws(() => buildInputReport([{ name: "node", metafile: duplicate }], root, root), /normalized/);
    assert.throws(() => assertLoadedBuildInputsCaptured({ builds: [] }), /missing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
