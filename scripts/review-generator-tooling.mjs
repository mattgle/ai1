import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { readReviewedTarFiles, verifySourceBytes } from "./review-ffmpeg-source.mjs";
import { verifyArchive } from "./review-theia-source.mjs";
import { selectPolyfillInputs } from "./review-polyfill-source.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const maximumFileBytes = 16 * 1024 * 1024;
const n = (name, file) => `node_modules/${name}/${file}`;
const polyfill = "esbuild-plugins-node-modules-polyfill";
const theia = "@theia/bundle-plugin";
const nestedTypes = "mlly/node_modules/pkg-types";
const nestedConfbox = "mlly/node_modules/confbox";

// The fixed set covers reviewed static candidates, not runtime-loaded closure.
export const reviewedPackages = [
  [polyfill, "1.8.3", "dist/index.js dist/index.js.map globals/Buffer.js"],
  [
    theia,
    "1.75.0",
    "lib/index.js lib/esbuild-plugin.js lib/index.js.map lib/esbuild-plugin.js.map src/index.ts src/esbuild-plugin.ts",
  ],
  ["esbuild", "0.28.2", "lib/main.js"],
  ["local-pkg", "1.2.1", "dist/index.cjs"],
  ["resolve.exports", "2.0.3", "dist/index.js"],
  ["tslib", "2.8.1", "tslib.js"],
  ["mlly", "1.8.2", "dist/index.cjs"],
  ["quansync", "0.2.11", "dist/macro.cjs dist/index.cjs"],
  [
    "resolve-package-path",
    "4.0.3",
    "lib/index.js lib/resolve-package-path.js lib/rethrow-unless-code.js lib/cache-group.js lib/cache.js lib/should-preserve-symlinks.js",
  ],
  ["detect-libc", "2.1.2", "lib/detect-libc.js lib/process.js lib/filesystem.js lib/elf.js"],
  ["acorn", "8.18.0", "dist/acorn.js"],
  ["ufo", "1.6.4", "dist/index.cjs"],
  ["pathe", "2.0.3", "dist/index.cjs dist/shared/pathe.BSlhyZSM.cjs"],
  [nestedTypes, "1.3.1", "dist/index.cjs"],
  [
    nestedConfbox,
    "0.1.8",
    "dist/index.cjs dist/json5.cjs dist/shared/confbox.6b479c78.cjs dist/yaml.cjs dist/toml.cjs dist/shared/confbox.3768c7e9.cjs",
  ],
  ["path-root", "0.1.1", "index.js"],
  ["path-root-regex", "0.1.2", "index.js"],
  ["@jspm/core", "2.1.0", ""],
].map(([location, version, files]) => ({
  path: `node_modules/${location}`,
  name: location.split("/node_modules/").at(-1),
  version,
  files: [...(files ? files.split(" ") : []), "package.json"],
}));

const p = n(polyfill, "dist/index.js");
const t = n(theia, "lib/esbuild-plugin.js");
const m = n("mlly", "dist/index.cjs");
const r = (file) => n("resolve-package-path", `lib/${file}.js`);
const c = (file) => n(nestedConfbox, `dist/${file}.cjs`);
const d = (file) => n("detect-libc", `lib/${file}.js`);

export const reviewedResolutions = [
  ["applications/electron/esbuild.mjs", polyfill, p],
  ["applications/electron/gen-esbuild.browser.mjs", theia, n(theia, "lib/index.js")],
  ["applications/electron/esbuild.mjs", "esbuild", n("esbuild", "lib/main.js")],
  [p, "local-pkg", n("local-pkg", "dist/index.cjs")],
  [p, "esbuild", n("esbuild", "lib/main.js")],
  [p, "resolve.exports", n("resolve.exports", "dist/index.js")],
  [n(theia, "lib/index.js"), "tslib", n("tslib", "tslib.js")],
  [n(theia, "lib/index.js"), "./esbuild-plugin", t],
  [t, "resolve-package-path", r("index")],
  [t, "detect-libc", d("detect-libc")],
  [n("local-pkg", "dist/index.cjs"), "mlly", m],
  [n("local-pkg", "dist/index.cjs"), "quansync/macro", n("quansync", "dist/macro.cjs")],
  [m, "acorn", n("acorn", "dist/acorn.js")],
  [m, "ufo", n("ufo", "dist/index.cjs")],
  [m, "pathe", n("pathe", "dist/index.cjs")],
  [m, "pkg-types", n(nestedTypes, "dist/index.cjs")],
  [n(nestedTypes, "dist/index.cjs"), "mlly", m],
  [n(nestedTypes, "dist/index.cjs"), "pathe", n("pathe", "dist/index.cjs")],
  [n(nestedTypes, "dist/index.cjs"), "confbox", c("index")],
  [n("quansync", "dist/macro.cjs"), "./index.cjs", n("quansync", "dist/index.cjs")],
  [r("index"), "./resolve-package-path", r("resolve-package-path")],
  [r("index"), "./rethrow-unless-code", r("rethrow-unless-code")],
  [r("index"), "./cache-group", r("cache-group")],
  [r("index"), "./cache", r("cache")],
  [r("resolve-package-path"), "path-root", n("path-root", "index.js")],
  [r("resolve-package-path"), "./rethrow-unless-code", r("rethrow-unless-code")],
  [r("resolve-package-path"), "./should-preserve-symlinks", r("should-preserve-symlinks")],
  [r("cache-group"), "./cache", r("cache")],
  [d("detect-libc"), "./process", d("process")],
  [d("detect-libc"), "./filesystem", d("filesystem")],
  [d("detect-libc"), "./elf", d("elf")],
  [n("path-root", "index.js"), "path-root-regex", n("path-root-regex", "index.js")],
  [n("pathe", "dist/index.cjs"), "./shared/pathe.BSlhyZSM.cjs", n("pathe", "dist/shared/pathe.BSlhyZSM.cjs")],
  ...["json5", "shared/confbox.6b479c78", "yaml", "toml", "shared/confbox.3768c7e9"].map((file) => [
    c("index"),
    `./${file}.cjs`,
    c(file),
  ]),
  ...["json5", "yaml", "toml"].map((file) => [
    c(file),
    "./shared/confbox.3768c7e9.cjs",
    c("shared/confbox.3768c7e9"),
  ]),
  [c("shared/confbox.6b479c78"), "./confbox.3768c7e9.cjs", c("shared/confbox.3768c7e9")],
];

export const reviewedGenerators = [
  {
    plugin: "node-modules-polyfills",
    build: "browser",
    path: p,
    bytes: 10262,
    sha256: "187f1f1197b169856d7e730a3101487bf01eecbc66fcd191d73699fca5cb4149",
    captures: 14,
    name: polyfill,
    version: "1.8.3",
  },
  {
    plugin: "@theia/esbuild-plugin",
    build: "node",
    path: t,
    bytes: 18558,
    sha256: "bce311ef78a59d4ae795f55dea95794a5859c33810d2e4a2410d2ec3a2b3cce1",
    captures: 8,
    name: theia,
    version: "1.75.0",
  },
];

const backendPaths = [
  "virtual/node-file/node_modules/drivelist/build/Release/drivelist.node",
  "virtual/node-file/node_modules/keytar/build/Release/keytar.node",
  "virtual/node-file/node_modules/@parcel/watcher-darwin-arm64/watcher.node",
  "virtual/node-file/node_modules/native-keymap/build/Release/keymapping.node",
  "node_modules/bindings/bindings.js",
  "node_modules/@stroncium/procfs/lib/parsers.js",
  "node_modules/node-pty/lib/utils.js",
  "node_modules/@vscode/ripgrep/lib/index.js",
];

function relativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.includes(":") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid reviewed relative path.");
  }
  return value;
}

export function boundedFile(root, relative) {
  relativePath(relative);
  if (!fs.lstatSync(root).isDirectory()) throw new Error("A regular candidate root is required.");
  let file = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error("A reviewed path is linked or has the wrong file type.");
    }
  }
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep))
    throw new Error("A reviewed file escapes its root.");
  if (fs.statSync(file).size > maximumFileBytes) throw new Error("A reviewed file exceeds the byte limit.");
  return file;
}

export function verifyResolution(root, parent, specifier, expected) {
  const parentFile = boundedFile(root, parent);
  const expectedFile = boundedFile(root, expected);
  const resolved = createRequire(parentFile).resolve(specifier);
  const relative = path.relative(root, resolved).split(path.sep).join("/");
  boundedFile(root, relative);
  if (resolved !== expectedFile) throw new Error("Parent-relative tooling resolution changes.");
  return { parent, specifier, resolved: expected };
}

export async function verifyCandidateArchive(bytes, integrity, records) {
  if (!records.length) throw new Error("No reviewed archive candidates.");
  const seen = new Set();
  for (const record of records) {
    relativePath(record.path);
    if (!record.path.startsWith("package/") || seen.has(record.path))
      throw new Error("Invalid or duplicate archive candidate.");
    seen.add(record.path);
  }
  verifyArchive(bytes, integrity);
  await readReviewedTarFiles(gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }), records);
  return { bytes: bytes.length, sha256: hash(bytes), integrity, selectedMatches: records.length };
}

export function verifyGeneratorReport(root, report) {
  if (report.schemaVersion !== 1 || !Array.isArray(report.builds))
    throw new Error("Invalid build input report.");
  if (new Set(report.builds.map((build) => build.name)).size !== report.builds.length)
    throw new Error("Duplicate report build.");
  for (const build of report.builds) {
    if (
      !Array.isArray(build.inputs) ||
      new Set(build.inputs.map((input) => input.path)).size !== build.inputs.length
    )
      throw new Error("Invalid or duplicate report inputs.");
  }
  selectPolyfillInputs(report);
  for (const generator of reviewedGenerators) {
    verifySourceBytes(fs.readFileSync(boundedFile(root, generator.path)), generator);
    const inputs = report.builds.flatMap((build) =>
      (build.inputs ?? [])
        .filter((input) => input.loadedSource?.plugin === generator.plugin)
        .map((input) => ({ build: build.name, input })),
    );
    if (
      inputs.length !== generator.captures ||
      new Set(inputs.map(({ input }) => input.path)).size !== inputs.length
    )
      throw new Error("The reviewed generator capture count or input set changes.");
    for (const { build, input } of inputs) {
      const loaded = input.loadedSource;
      const recorded = loaded.generator;
      if (
        build !== generator.build ||
        loaded.status !== "captured-plugin-load" ||
        recorded?.status !== "on-disk" ||
        recorded.path !== generator.path ||
        recorded.bytes !== generator.bytes ||
        recorded.sha256 !== generator.sha256 ||
        recorded.package?.name !== generator.name ||
        recorded.package?.version !== generator.version ||
        recorded.package?.path !== n(generator.name, "package.json") ||
        !Number.isSafeInteger(loaded.bytes) ||
        loaded.bytes < 0 ||
        loaded.bytes !== input.bytes ||
        !/^[a-f0-9]{64}$/.test(loaded.sha256 ?? "")
      )
        throw new Error("The report generator identity or capture record changes.");
      if (generator.build === "node" && !backendPaths.includes(input.path))
        throw new Error("An unreviewed backend capture is present.");
    }
  }
  return reviewedGenerators;
}

function regularDirectory(folder) {
  if (!fs.lstatSync(folder).isDirectory()) throw new Error("A regular input directory is required.");
  return fs.realpathSync(folder);
}

export async function reviewGeneratorTooling(root, archiveFolder, buildReportPath) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Only the reviewed darwin-arm64 toolchain and production capture set are supported.");
  root = regularDirectory(root);
  archiveFolder = regularDirectory(archiveFolder);
  const reportDirectory = regularDirectory(path.dirname(path.resolve(buildReportPath)));
  const reportFile = boundedFile(reportDirectory, path.basename(buildReportPath));
  const reportBytes = fs.readFileSync(reportFile);
  const generators = verifyGeneratorReport(root, JSON.parse(reportBytes));
  const lock = JSON.parse(fs.readFileSync(boundedFile(root, "package-lock.json")));
  const packages = [];
  const candidates = new Set();
  const hostPackage = {
    path: "node_modules/@esbuild/darwin-arm64",
    name: "@esbuild/darwin-arm64",
    version: "0.28.2",
    files: ["bin/esbuild", "package.json"],
  };
  for (const entry of [...reviewedPackages, hostPackage]) {
    const manifestBytes = fs.readFileSync(boundedFile(root, `${entry.path}/package.json`));
    const manifest = JSON.parse(manifestBytes);
    const locked = lock.packages?.[entry.path];
    if (
      manifest.name !== entry.name ||
      manifest.version !== entry.version ||
      locked?.version !== entry.version
    )
      throw new Error("A tooling manifest or nested lockfile identity changes.");
    const url = new URL(locked.resolved);
    const expectedUrl = `https://registry.npmjs.org/${entry.name}/-/${entry.name.split("/").at(-1)}-${entry.version}.tgz`;
    if (url.href !== expectedUrl) throw new Error("An unreviewed tooling archive URL is present.");
    const records = entry.files.map((file) => {
      const relative = `${entry.path}/${file}`;
      if (candidates.has(relative)) throw new Error("Duplicate tooling candidate.");
      candidates.add(relative);
      const bytes = fs.readFileSync(boundedFile(root, relative));
      return { path: `package/${file}`, bytes: bytes.length, sha256: hash(bytes) };
    });
    const bytes = fs.readFileSync(boundedFile(archiveFolder, path.posix.basename(url.pathname)));
    packages.push({
      path: entry.path,
      name: entry.name,
      version: entry.version,
      records,
      archive: await verifyCandidateArchive(bytes, locked.integrity, records),
    });
  }
  const resolutions = reviewedResolutions.map(([parent, specifier, expected]) =>
    verifyResolution(root, parent, specifier, expected),
  );
  const hostBinary = verifyResolution(
    root,
    n("esbuild", "lib/main.js"),
    "@esbuild/darwin-arm64/bin/esbuild",
    n("@esbuild/darwin-arm64", "bin/esbuild"),
  );
  const sanitizerBytes = fs.readFileSync(boundedFile(root, "scripts/dompurify-build-plugin.cjs"));
  const unresolved = [n("esbuild", "lib/main.js"), r("index")].map((parent) => {
    try {
      createRequire(boundedFile(root, parent)).resolve("pnpapi");
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
      return { parent, specifier: "pnpapi", status: "MODULE_NOT_FOUND" };
    }
    throw new Error("An unreviewed pnpapi tooling resolution is present.");
  });
  return {
    scope:
      "Current reviewed static tooling candidates and selected archive bytes only. This is not original-build capture, runtime-loaded dependency closure, compilation provenance, or release-gate clearance.",
    buildReport: { bytes: reportBytes.length, sha256: hash(reportBytes) },
    host: "darwin-arm64",
    staticModuleCandidates: 33,
    selectedFiles: candidates.size,
    packageArchives: packages.length,
    generators,
    packages: packages.filter((entry) => entry.name !== hostPackage.name),
    resolutions,
    hostEsbuild: {
      ...hostBinary,
      ...packages.find((entry) => entry.name === hostPackage.name),
      executed: false,
      currentProcessBinaryOverrideSet: Boolean(process.env.ESBUILD_BINARY_PATH),
      originalBuildBinarySelectionVerified: false,
    },
    conditionalLinuxCandidate: { package: "detect-libc", branchExecuted: false },
    sanitizerGenerator: {
      path: "scripts/dompurify-build-plugin.cjs",
      bytes: sanitizerBytes.length,
      sha256: hash(sanitizerBytes),
      productionReportIdentity: "not-recorded",
    },
    unresolved,
    remainingGaps: [
      "Absent optional pnpapi imports do not establish runtime safety or unreachable caller branches.",
      "local-pkg has nonliteral require('u' + 'rl'); this expression is not resolved by the static candidate check.",
      "Dynamic require.resolve paths, environment overrides, Node runtime bytes, resolver branches, importer manifests, and copied inputs are not a complete tooling closure.",
      "The original tooling environment, loaded dependency bytes, host binary selection, and default-loader snapshots remain unrecorded.",
      "The sanitizer generator identity is not recorded in the production report.",
      "Complete compilation provenance, corresponding source, and license duties remain open.",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        "Use: node scripts/review-generator-tooling.mjs <local-archive-folder> <build-input-report.json>",
      );
    const root = fileURLToPath(new URL("../", import.meta.url));
    console.log(
      JSON.stringify(await reviewGeneratorTooling(root, process.argv[2], process.argv[3]), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
