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
import { buildInputReport, captureBuildPlugin } from "../../scripts/build-input-report.mjs";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sanitizerTransformations = new Map();
const browserLoadedSources = [];
const nodeLoadedSources = [];
for (const [options, pluginName, loadedSources, generatorPath] of [
  [
    browserOptions,
    "node-modules-polyfills",
    browserLoadedSources,
    require.resolve("esbuild-plugins-node-modules-polyfill"),
  ],
  [
    nodeOptions,
    "@theia/esbuild-plugin",
    nodeLoadedSources,
    require.resolve("@theia/bundle-plugin/lib/esbuild-plugin"),
  ],
]) {
  if (options.plugins.filter((plugin) => plugin.name === pluginName).length !== 1)
    throw new Error(`The build requires one source capture plugin: ${pluginName}`);
  options.plugins = options.plugins.map((plugin) =>
    plugin.name === pluginName ? captureBuildPlugin(plugin, loadedSources, generatorPath) : plugin,
  );
}
browserOptions.plugins.unshift(
  dompurifyPlugin.dompurifyBuildPlugin(require.resolve("dompurify"), (record) => {
    sanitizerTransformations.set(record.path, record);
  }),
);
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
        {
          name: "browser",
          metafile: browser.metafile,
          transformations: [...sanitizerTransformations.values()],
          loadedSources: browserLoadedSources,
        },
        { name: "node", metafile: node.metafile, loadedSources: nodeLoadedSources },
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
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
