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

export async function reviewTheiaSource(payload, lockfile) {
  const lock = JSON.parse(fs.readFileSync(lockfile, "utf8"));
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
    const extract = tar.extract();
    const done = new Promise((resolve, reject) => {
      extract.on("finish", resolve);
      extract.on("error", reject);
    });
    extract.on("entry", (header, stream, next) => {
      const parts = [];
      const relevant =
        header.type === "file" && /^package\/(src|lib)\//.test(header.name) && !header.name.endsWith(".map");
      stream.on("data", (part) => {
        if (relevant) parts.push(part);
      });
      stream.on("error", (error) => extract.destroy(error));
      stream.on("end", () => {
        try {
          if (relevant) {
            const status = compareFile(folder, header.name, Buffer.concat(parts));
            if (status === "changed") result.changed.push(header.name.slice(8));
            else result[status]++;
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
    packages.push(result);
  }
  if (!packages.length) throw new Error("No Theia 1.75.0 packages are present in the payload.");
  return {
    scope:
      "Published Theia 1.75.0 src/lib files present in the payload. This does not verify generated bundles, added files, or complete source duties.",
    packages,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("Use review-theia-source.mjs <app-payload> <lockfile>.");
  const report = await reviewTheiaSource(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(report, null, 2));
  if (report.packages.some((entry) => entry.changed.length)) process.exitCode = 1;
}
