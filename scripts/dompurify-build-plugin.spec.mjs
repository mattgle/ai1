import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import plugin from "./dompurify-build-plugin.cjs";

test("the sanitizer replacement keeps same-directory imports relative", () => {
  const folder = path.resolve("fixture/node_modules/@theia/monaco-editor-core/esm/vs/base/browser/dompurify");
  let load;
  plugin.dompurifyBuildPlugin(path.join(folder, ".fixed.js")).setup({
    onLoad: (_options, callback) => {
      load = callback;
    },
  });
  const result = load({ path: path.join(folder, "dompurify.js") });
  assert.equal(
    result.contents,
    'import createDOMPurify from "./.fixed.js";\nexport default createDOMPurify();',
  );
  assert.equal(result.resolveDir, folder);
});

test("the build replaces only Monaco's embedded sanitizer with a separate instance", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-dompurify-build-")));
  try {
    const legacy = path.join(
      root,
      "node_modules/@theia/monaco-editor-core/esm/vs/base/browser/dompurify/dompurify.js",
    );
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, 'throw new Error("Legacy sanitizer executes");');
    const unrelated = path.join(root, "other/dompurify/dompurify.js");
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, 'export default "Unrelated file";');
    const fixed = path.join(root, "fixed.mjs");
    fs.writeFileSync(fixed, "function factory() { return {}; } export default factory;");
    const transformations = [];
    const result = await build({
      stdin: {
        contents: `import factory from ${JSON.stringify(fixed)};
        import monaco from ${JSON.stringify(legacy)};
        import unrelated from ${JSON.stringify(unrelated)};
        globalThis.result = { separate: monaco !== factory, unrelated };`,
        resolveDir: root,
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      plugins: [plugin.dompurifyBuildPlugin(fixed, (record) => transformations.push(record))],
    });
    const context = {};
    vm.runInNewContext(result.outputFiles[0].text, context);
    assert.equal(context.result.separate, true);
    assert.equal(context.result.unrelated, "Unrelated file");
    assert.equal(result.outputFiles[0].text.includes("Legacy sanitizer executes"), false);
    assert.equal(fs.readFileSync(legacy, "utf8"), 'throw new Error("Legacy sanitizer executes");');
    assert.equal(transformations.length, 1);
    const record = transformations[0];
    assert.equal(record.path, legacy);
    assert.ok(record.original.equals(fs.readFileSync(legacy)));
    assert.equal(record.replacementPath, fixed);
    assert.ok(record.replacement.equals(fs.readFileSync(fixed)));
    assert.equal(record.contents.includes(root), false);
    const specifier = JSON.parse(/^import createDOMPurify from (.+);\n/.exec(record.contents)[1]);
    assert.equal(path.resolve(path.dirname(legacy), specifier), fixed);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
