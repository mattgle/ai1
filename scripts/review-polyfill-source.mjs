import * as fs from "node:fs";
import { Buffer } from "node:buffer";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { readReviewedTarFiles, verifySourceBytes } from "./review-ffmpeg-source.mjs";

const require = createRequire(import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const modules = ["buffer", "string_decoder", "path", "os", "net", "child_process"];
const generatorHash = "187f1f1197b169856d7e730a3101487bf01eecbc66fcd191d73699fca5cb4149";

function relativeSource(root, file) {
  const relative = path.relative(root, fs.realpathSync(file)).split(path.sep).join("/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("A polyfill source falls outside the workspace.");
  }
  return relative;
}

export function verifyProductionContent(input, bytes) {
  if (input?.loadedSource?.status !== "captured-plugin-load") {
    throw new Error("The production input has no plugin load capture.");
  }
  verifySourceBytes(bytes, input.loadedSource);
}

export function selectPolyfillInputs(report) {
  const browser = report.builds?.find((build) => build.name === "browser");
  const inputs = browser?.inputs?.filter((input) => input.path.startsWith("virtual/node-modules-polyfills"));
  const expected = new Set([
    ...modules.map((name) => `virtual/node-modules-polyfills/${name}`),
    ...modules.map((name) => `virtual/node-modules-polyfills-commonjs/${name}`),
    "virtual/node-modules-polyfills/node:buffer",
    "virtual/node-modules-polyfills-empty/stream",
  ]);
  if (!inputs || inputs.length !== expected.size) throw new Error("The reviewed polyfill input set changes.");
  for (const input of inputs) {
    if (!expected.delete(input.path)) throw new Error("An unknown or duplicate polyfill input is present.");
    if (
      input.loadedSource?.plugin !== "node-modules-polyfills" ||
      input.loadedSource?.generator?.sha256 !== generatorHash
    ) {
      throw new Error("A production capture uses a different generator.");
    }
  }
  return inputs;
}

export async function reconstructPolyfill({ root, workingDirectory, entry, productionInputs }) {
  if (!productionInputs.length) throw new Error("A production polyfill entry is absent.");
  const { build } = require("esbuild");
  const snapshots = new Map();
  const options = {
    absWorkingDir: workingDirectory,
    write: false,
    format: "esm",
    bundle: true,
    logLevel: "silent",
    entryPoints: [entry],
  };
  const captured = await build({
    ...options,
    metafile: true,
    plugins: [
      {
        name: "polyfill-source-review",
        setup(context) {
          context.onLoad({ filter: /\.js$/ }, async (args) => {
            const local = relativeSource(root, args.path);
            const bytes = await fs.promises.readFile(args.path);
            snapshots.set(local, { bytes: bytes.length, sha256: hash(bytes) });
            return { contents: bytes, loader: "js", resolveDir: path.dirname(args.path) };
          });
        },
      },
    ],
  });
  const baseline = await build(options);
  if (!Buffer.from(captured.outputFiles[0].contents).equals(Buffer.from(baseline.outputFiles[0].contents))) {
    throw new Error("The source snapshot loader changes the nested output.");
  }
  const generated = Buffer.from(captured.outputFiles[0].text.replace(/eval\(/g, "(0,eval)("));
  const inputs = Object.entries(captured.metafile.inputs).map(([file, metadata]) => {
    const absolute = path.resolve(workingDirectory, file);
    const local = relativeSource(root, absolute);
    const snapshot = snapshots.get(local);
    if (!snapshot || snapshot.bytes !== metadata.bytes) {
      throw new Error("A nested input has no exact source snapshot.");
    }
    verifySourceBytes(fs.readFileSync(absolute), snapshot);
    return { path: local, ...snapshot };
  });
  const externalImports = Object.values(captured.metafile.inputs).flatMap((input) =>
    input.imports.filter((item) => item.external),
  );
  if (externalImports.length) throw new Error("A nested polyfill has external imports.");
  productionInputs.forEach((input) => verifyProductionContent(input, generated));
  return {
    entry: relativeSource(root, entry),
    generated: { bytes: generated.length, sha256: hash(generated) },
    productionMatches: productionInputs.map((input) => input.path),
    inputs,
    externalImports,
  };
}

export async function verifyPolyfillArchive(bytes, integrity, inputs) {
  if (
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity ?? "") ||
    `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity
  ) {
    throw new Error("The published polyfill archive fails lockfile integrity.");
  }
  const prefix = "node_modules/@jspm/core/";
  const records = new Map();
  for (const input of inputs) {
    if (!input.path.startsWith(prefix) || input.path.includes("..") || input.path.includes("\\")) {
      throw new Error("Invalid JSPM source path.");
    }
    const name = `package/${input.path.slice(prefix.length)}`;
    const previous = records.get(name);
    if (previous && (previous.sha256 !== input.sha256 || previous.bytes !== input.bytes)) {
      throw new Error("Conflicting nested source records.");
    }
    records.set(name, { ...input, path: name });
  }
  if (!records.size) throw new Error("No nested source records.");
  await readReviewedTarFiles(gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }), [...records.values()]);
  return { bytes: bytes.length, sha256: hash(bytes), integrity, matchingSourceFiles: records.size };
}

export async function reviewPolyfillSource(root, archivePath, packagedRoot) {
  root = fs.realpathSync(root);
  const workingDirectory = path.join(root, "applications/electron");
  const reportBytes = fs.readFileSync(path.join(workingDirectory, "resources/release/build-inputs.json"));
  if (
    packagedRoot &&
    !reportBytes.equals(fs.readFileSync(path.join(packagedRoot, "resources/release/build-inputs.json")))
  ) {
    throw new Error("Production and packaged build-input reports differ.");
  }
  const polyfillInputs = selectPolyfillInputs(JSON.parse(reportBytes));
  const generator = require.resolve("esbuild-plugins-node-modules-polyfill");
  if (hash(fs.readFileSync(generator)) !== generatorHash) throw new Error("The reviewed generator changes.");
  const jspm = path.resolve(require.resolve("@jspm/core/nodelibs/buffer"), "../../..");
  const manifest = JSON.parse(fs.readFileSync(path.join(jspm, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const locked = lock.packages["node_modules/@jspm/core"];
  if (locked.version !== manifest.version) throw new Error("Installed JSPM does not match the lockfile.");
  const { resolve } = require("resolve.exports");
  const records = [];
  const reviewed = new Set();
  for (const name of modules) {
    const entry = path.join(jspm, resolve(manifest, `./nodelibs/${name}`, { browser: true })[0]);
    const productionInputs = polyfillInputs.filter((input) =>
      [name, `node:${name}`].some((value) => input.path === `virtual/node-modules-polyfills/${value}`),
    );
    const record = await reconstructPolyfill({ root, workingDirectory, entry, productionInputs });
    productionInputs.forEach((input) => reviewed.add(input.path));
    records.push({ name, ...record });
  }
  const templates = [];
  for (const input of polyfillInputs) {
    if (reviewed.has(input.path)) continue;
    const name = input.path.split("/").at(-1);
    let bytes;
    if (modules.includes(name) && input.path === `virtual/node-modules-polyfills-commonjs/${name}`) {
      bytes = Buffer.from(`export * from '${name}'`);
    } else if (input.path === "virtual/node-modules-polyfills-empty/stream") {
      bytes = Buffer.from("module.exports = {}");
    } else {
      throw new Error("An unreviewed production polyfill input is present.");
    }
    verifyProductionContent(input, bytes);
    templates.push({ path: input.path, bytes: bytes.length, sha256: hash(bytes) });
  }
  const archive = await verifyPolyfillArchive(
    fs.readFileSync(archivePath),
    locked.integrity,
    records.flatMap((record) => record.inputs),
  );
  return {
    scope: "Independent reconstruction, not original-build nested capture or license clearance.",
    workingDirectory: "applications/electron",
    reportSha256: hash(reportBytes),
    packagedReportMatches: Boolean(packagedRoot),
    generator: { path: relativeSource(root, generator), sha256: generatorHash },
    versions: { esbuild: require("esbuild/package.json").version, jspm: manifest.version },
    records,
    templates,
    publishedArchive: { url: locked.resolved, ...archive },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) {
      throw new Error(
        "Use: node scripts/review-polyfill-source.mjs <local-jspm-archive> [packaged-app-resources]",
      );
    }
    const root = fileURLToPath(new URL("../", import.meta.url));
    console.log(JSON.stringify(await reviewPolyfillSource(root, process.argv[2], process.argv[3]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
