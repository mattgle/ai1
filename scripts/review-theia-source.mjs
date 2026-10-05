import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import tar from "tar-stream";

export function verifyArchive(bytes, integrity) {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-"))
    throw new Error("A SHA-512 lockfile integrity value is required.");
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity)
    throw new Error("The published archive does not match the lockfile.");
}

export function compareFile(folder, name, bytes) {
  if (!name.startsWith("package/") || name.includes("\\")) throw new Error("Invalid archive path.");
  const relative = name.slice("package/".length);
  if (!relative || relative.split("/").some((part) => part === ".." || part === "." || !part))
    throw new Error("Invalid archive path.");
  const file = path.resolve(folder, relative);
  if (!file.startsWith(path.resolve(folder) + path.sep)) throw new Error("Invalid archive path.");
  if (!fs.existsSync(file)) return "absent";
  const real = fs.realpathSync(file);
  if (!real.startsWith(fs.realpathSync(folder) + path.sep))
    throw new Error("Source file escapes the package.");
  if (!fs.statSync(real).isFile()) throw new Error("The source path is not a file.");
  return fs.readFileSync(real).equals(bytes) ? "equal" : "changed";
}

export function contributingTheiaInputs(report) {
  if (report.schemaVersion !== 1 || !Array.isArray(report.builds) || !report.builds.length)
    throw new Error("Invalid build input report.");
  const packages = new Map();
  const validPath = (value) =>
    typeof value === "string" &&
    !path.posix.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.includes(":") &&
    value.split("/").every((part) => part && part !== "." && part !== "..");
  for (const build of report.builds) {
    if (!Array.isArray(build.inputs) || !Array.isArray(build.outputs) || !build.outputs.length)
      throw new Error("Invalid build input report.");
    const inputs = new Map(build.inputs.map((input) => [input.path, input]));
    if (inputs.size !== build.inputs.length) throw new Error("Duplicate build input metadata.");
    for (const output of build.outputs) {
      if (!Array.isArray(output.inputs)) throw new Error("Invalid output input report.");
      for (const contribution of output.inputs) {
        if (!Number.isFinite(contribution.bytesInOutput) || contribution.bytesInOutput < 0)
          throw new Error("Invalid input byte contribution.");
        if (!(contribution.bytesInOutput > 0)) continue;
        const input = inputs.get(contribution.path);
        if (!input) throw new Error("A contributing input has no metadata.");
        const metadata = input.package;
        if (!metadata?.name?.startsWith("@theia/") || metadata.version !== "1.75.0") continue;
        if (!validPath(input.path) || !validPath(metadata.path)) throw new Error("Invalid Theia input path.");
        const expected = `node_modules/${metadata.name}/package.json`;
        if (metadata.path !== expected)
          throw new Error("The Theia input package path does not match its name.");
        const folder = path.posix.dirname(metadata.path);
        if (!input.path.startsWith(folder + "/")) throw new Error("The Theia input escapes its package.");
        const files = packages.get(metadata.name) ?? new Set();
        files.add(input.path.slice(folder.length + 1));
        packages.set(metadata.name, files);
      }
    }
  }
  if (!packages.size) throw new Error("No contributing Theia 1.75.0 inputs are present.");
  return packages;
}

export function sourceReviewHasGaps(report) {
  return report.packages.some(
    (entry) => entry.changed.length || entry.buildInputs?.some((input) => input.status !== "equal"),
  );
}

export async function reviewTheiaSource(payload, lockfile, buildReport) {
  const lock = JSON.parse(fs.readFileSync(lockfile, "utf8"));
  const contributing = buildReport
    ? contributingTheiaInputs(JSON.parse(fs.readFileSync(buildReport, "utf8")))
    : undefined;
  const modules = path.join(payload, "node_modules/@theia");
  const packages = [];
  for (const leaf of fs.readdirSync(modules).sort()) {
    const folder = path.join(modules, leaf);
    const metadata = path.join(folder, "package.json");
    if (!fs.existsSync(metadata)) continue;
    const manifest = JSON.parse(fs.readFileSync(metadata, "utf8"));
    if (manifest.version !== "1.75.0") continue;
    if (manifest.name !== `@theia/${leaf}`) throw new Error("The package name does not match its folder.");
    const entry = lock.packages[`node_modules/@theia/${leaf}`];
    if (
      !entry ||
      entry.version !== manifest.version ||
      !entry.resolved?.startsWith("https://registry.npmjs.org/")
    )
      throw new Error(`No exact registry lock entry: ${manifest.name}`);
    const response = await globalThis.fetch(entry.resolved, {
      signal: globalThis.AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Archive request fails: ${manifest.name} (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyArchive(bytes, entry.integrity);
    const result = {
      name: manifest.name,
      version: manifest.version,
      integrity: entry.integrity,
      equal: 0,
      absent: 0,
      changed: [],
    };
    const inputResults = new Map();
    const extract = tar.extract();
    const done = new Promise((resolve, reject) => {
      extract.on("finish", resolve);
      extract.on("error", reject);
    });
    extract.on("entry", (header, stream, next) => {
      const parts = [];
      const originalScope =
        header.type === "file" && /^package\/(src|lib)\//.test(header.name) && !header.name.endsWith(".map");
      const contributingInput =
        header.type === "file" &&
        header.name.startsWith("package/") &&
        contributing?.get(manifest.name)?.has(header.name.slice(8));
      const relevant = originalScope || contributingInput;
      stream.on("data", (part) => {
        if (relevant) parts.push(part);
      });
      stream.on("error", (error) => extract.destroy(error));
      stream.on("end", () => {
        try {
          if (relevant) {
            const status = compareFile(folder, header.name, Buffer.concat(parts));
            if (contributingInput) inputResults.set(header.name.slice(8), status);
            if (originalScope) {
              if (status === "changed") result.changed.push(header.name.slice(8));
              else result[status]++;
            }
          }
          next();
        } catch (error) {
          extract.destroy(error);
        }
      });
      stream.resume();
    });
    extract.end(gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }));
    await done;
    if (contributing)
      result.buildInputs = [...(contributing.get(manifest.name) ?? [])].sort().map((file) => ({
        path: file,
        status: inputResults.get(file) ?? "outside-checked-archive-files",
      }));
    packages.push(result);
  }
  if (!packages.length) throw new Error("No Theia 1.75.0 packages are present in the payload.");
  if (contributing)
    for (const name of contributing.keys()) {
      if (!packages.some((entry) => entry.name === name))
        throw new Error(`A contributing Theia package is absent: ${name}`);
    }
  return {
    scope:
      "Published Theia 1.75.0 src/lib files present in the payload. This does not verify generated bundles, added files, or complete source duties.",
    ...(contributing
      ? {
          buildInputScope:
            "Contributing metadata paths matched to published archive bytes and payload files, including paths outside src/lib. This does not verify transformed input bytes or corresponding-source completeness.",
        }
      : {}),
    packages,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 && process.argv.length !== 5)
    throw new Error("Use review-theia-source.mjs <app-payload> <lockfile> [build-input-report].");
  const report = await reviewTheiaSource(process.argv[2], process.argv[3], process.argv[4]);
  console.log(JSON.stringify(report, null, 2));
  if (sourceReviewHasGaps(report)) process.exitCode = 1;
}
