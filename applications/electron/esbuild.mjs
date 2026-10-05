/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from "./gen-esbuild.browser.mjs";
import { nodeOptions } from "./gen-esbuild.node.mjs";
import { electronOptions } from "./gen-esbuild.electron.mjs";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import dompurifyPlugin from "../../scripts/dompurify-build-plugin.cjs";
import { buildInputReport } from "../../scripts/build-input-report.mjs";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
browserOptions.plugins.unshift(dompurifyPlugin.dompurifyBuildPlugin(require.resolve("dompurify")));
for (const options of [browserOptions, nodeOptions, electronOptions]) options.metafile = true;

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);
const electronContext = await esbuild.context(electronOptions);

if (watch) {
  await Promise.all([browserContext.watch(), nodeContext.watch(), electronContext.watch()]);
} else {
  try {
    const browser = await browserContext.rebuild();
    await browserContext.dispose();
    const node = await nodeContext.rebuild();
    await nodeContext.dispose();
    const electron = await electronContext.rebuild();
    await electronContext.dispose();
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const report = buildInputReport(
      [
        { name: "browser", metafile: browser.metafile },
        { name: "node", metafile: node.metafile },
        { name: "electron", metafile: electron.metafile },
      ],
      path.resolve(directory, "../.."),
      directory,
    );
    fs.mkdirSync(path.join(directory, "resources/release"), { recursive: true });
    fs.writeFileSync(
      path.join(directory, "resources/release/build-inputs.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  } catch {
    process.exit(1);
  }
}
