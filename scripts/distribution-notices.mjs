import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const noticeName = /^(?:licen[cs]es?|notices?|copying|copyright|ofl)(?:$|[._-])/i;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function generateDistributionNotices(
  payload,
  output,
  ownLicense = path.join(checkout, "LICENSE"),
  supplementFile,
) {
  const requestedPayload = path.resolve(payload);
  payload = fs.realpathSync(payload);
  output = path.resolve(output);
  if (output === requestedPayload || output.startsWith(requestedPayload + path.sep))
    output = path.join(payload, path.relative(requestedPayload, output));
  const records = [];
  const packages = [];
  const unresolved = [];
  const texts = new Map();
  const supplements = new Map();
  if (supplementFile) {
    const config = JSON.parse(fs.readFileSync(supplementFile, "utf8"));
    if (config.schemaVersion !== 1 || !config.sources || !Array.isArray(config.packages))
      throw new Error("Invalid license supplements.");
    const sources = new Map();
    for (const [id, source] of Object.entries(config.sources)) {
      if (
        typeof source.license !== "string" ||
        !source.license ||
        typeof source.text !== "string" ||
        path.isAbsolute(source.text) ||
        !/^[a-f0-9]{64}$/.test(source.sha256) ||
        !/^[a-f0-9]{40}$/.test(source.revision) ||
        typeof source.url !== "string" ||
        !source.url.startsWith("https://") ||
        !source.url.includes(`/${source.revision}/`)
      )
        throw new Error(`Invalid license source: ${id}`);
      const file = fs.realpathSync(path.resolve(path.dirname(supplementFile), source.text));
      if (!noticeName.test(path.basename(file)))
        throw new Error("License supplement must have a notice filename.");
      if (!file.startsWith(payload + path.sep))
        throw new Error("License supplement escapes the app payload.");
      if (file === output || file.startsWith(output + path.sep))
        throw new Error("License supplements must not use generated notice output.");
      if (hash(fs.readFileSync(file)) !== source.sha256)
        throw new Error(`License supplement hash mismatch: ${id}`);
      sources.set(id, { ...source, path: path.relative(payload, file).split(path.sep).join("/") });
    }
    for (const entry of config.packages) {
      if (
        typeof entry.name !== "string" ||
        !entry.name ||
        typeof entry.version !== "string" ||
        !entry.version ||
        !sources.has(entry.source)
      )
        throw new Error("Invalid license supplement package.");
      const key = `${entry.name}@${entry.version}`;
      if (supplements.has(key)) throw new Error(`Duplicate license supplement: ${key}`);
      supplements.set(key, sources.get(entry.source));
    }
  }
  function samePackageParent(folder, manifest) {
    let ancestor = path.dirname(folder);
    while (ancestor === payload || ancestor.startsWith(payload + path.sep)) {
      if (path.basename(ancestor) === "node_modules") return undefined;
      const metadata = path.join(ancestor, "package.json");
      if (fs.existsSync(metadata)) {
        let parent;
        try {
          parent = JSON.parse(fs.readFileSync(metadata, "utf8"));
        } catch {
          return undefined;
        }
        if (parent.name !== manifest.name || parent.version !== manifest.version) return undefined;
        const notices = fs
          .readdirSync(ancestor, { withFileTypes: true })
          .filter((entry) => entry.isFile() && noticeName.test(entry.name))
          .map((entry) => path.relative(payload, path.join(ancestor, entry.name)).split(path.sep).join("/"));
        return {
          license: parent.license,
          notices,
          source: path.relative(payload, metadata).split(path.sep).join("/"),
        };
      }
      ancestor = path.dirname(ancestor);
    }
    return undefined;
  }
  function visit(folder) {
    if (folder === output) return;
    const entries = fs
      .readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    const localNotices = entries.filter((entry) => entry.isFile() && noticeName.test(entry.name));
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      const relative = path.relative(payload, file).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        const target = fs.realpathSync(file);
        if (target !== payload && !target.startsWith(payload + path.sep))
          unresolved.push({ path: relative, reason: "External symbolic link" });
        continue;
      }
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && noticeName.test(entry.name)) {
        const bytes = fs.readFileSync(file);
        const digest = hash(bytes);
        texts.set(digest, bytes);
        records.push({ path: relative, sha256: digest, text: `texts/${digest}.txt` });
      } else if (entry.isFile() && entry.name === "package.json") {
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
          unresolved.push({ path: relative, reason: "Invalid package metadata" });
          continue;
        }
        if (typeof manifest.name !== "string" || typeof manifest.version !== "string") continue;
        const parent = samePackageParent(folder, manifest);
        const license =
          typeof manifest.license === "string"
            ? manifest.license
            : (manifest.license?.type ??
              manifest.licenses?.map((entry) => entry.type).join(" OR ") ??
              (typeof parent?.license === "string" ? parent.license : undefined));
        let notices = localNotices.length
          ? localNotices.map((entry) => path.posix.join(path.posix.dirname(relative), entry.name))
          : (parent?.notices ?? []);
        const supplement = supplements.get(`${manifest.name}@${manifest.version}`);
        const useSupplement = !notices.length && supplement !== undefined && supplement.license === license;
        if (useSupplement) notices = [supplement.path];
        packages.push({
          path: relative,
          name: manifest.name,
          version: manifest.version,
          license: license ?? null,
          notices,
          ...(parent ? { parentPackage: parent.source } : {}),
          ...(useSupplement
            ? {
                licenseSupplement: {
                  url: supplement.url,
                  revision: supplement.revision,
                  sha256: supplement.sha256,
                },
              }
            : {}),
        });
        if (!license) unresolved.push({ path: relative, reason: "Missing license metadata" });
        if (!notices.length && !manifest.name.startsWith("ai1-") && manifest.name !== "decompress") {
          unresolved.push({
            path: relative,
            reason: "No package-level license text; review parent or embedded notices",
          });
        }
      }
    }
  }
  visit(payload);
  fs.mkdirSync(path.join(output, "texts"), { recursive: true });
  for (const [digest, bytes] of texts) fs.writeFileSync(path.join(output, "texts", `${digest}.txt`), bytes);
  fs.copyFileSync(ownLicense, path.join(output, "AI1-LICENSE.txt"));
  const manifest = {
    schemaVersion: 1,
    scope: "Actual app files. This inventory does not certify license compliance.",
    packages,
    notices: records,
    unresolved,
  };
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(
    path.join(output, "README.txt"),
    "AI1 uses the MIT license in AI1-LICENSE.txt. Third-party licenses remain separate.\nmanifest.json lists the package paths and notice texts from this app.\ntexts/ contains unchanged notice bytes. Unresolved entries block distribution.\nReview fonts, icons, native libraries, source-offer duties, and extension assets before release.\n",
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error("Use distribution-notices.mjs <app-payload> <notice-output>.");
    const manifest = generateDistributionNotices(process.argv[2], process.argv[3]);
    console.log(
      `${manifest.packages.length} packages, ${manifest.notices.length} notice files, ${manifest.unresolved.length} entries require review.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
