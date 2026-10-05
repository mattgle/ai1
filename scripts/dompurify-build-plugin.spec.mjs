import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import plugin from "./dompurify-build-plugin.cjs";

test("the build replaces only Monaco's embedded sanitizer with a separate instance", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-dompurify-build-"));
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
      plugins: [plugin.dompurifyBuildPlugin(fixed)],
    });
    const context = {};
    vm.runInNewContext(result.outputFiles[0].text, context);
    assert.equal(context.result.separate, true);
    assert.equal(context.result.unrelated, "Unrelated file");
    assert.equal(result.outputFiles[0].text.includes("Legacy sanitizer executes"), false);
    assert.equal(fs.readFileSync(legacy, "utf8"), 'throw new Error("Legacy sanitizer executes");');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
