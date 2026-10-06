import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export function buildInputReport(builds, root, workingDirectory) {
  root = path.resolve(root);
  const virtualPath = (file) => /^([A-Za-z0-9_-]+):(.*)$/.exec(file);
  const relative = (file) => {
    const virtual = virtualPath(file);
    if (virtual) {
      const source = virtual[2];
      if (path.isAbsolute(source)) return `virtual/${virtual[1]}/${relative(source)}`;
      if (source.includes("\\") || source.split("/").includes(".."))
        throw new Error("Invalid virtual build input.");
      return `virtual/${virtual[1]}/${source}`;
    }
    const absolute = path.resolve(workingDirectory, file);
    if (!absolute.startsWith(root + path.sep)) throw new Error("Build evidence escapes the repository.");
    return path.relative(root, absolute).split(path.sep).join("/");
  };
  const packageFor = (input) => {
    const virtual = virtualPath(input);
    if (virtual) {
      if (!path.isAbsolute(virtual[2])) return null;
      input = virtual[2];
    }
    const absolute = path.resolve(workingDirectory, input);
    let folder = path.dirname(absolute);
    while (folder.startsWith(root + path.sep)) {
      const metadata = path.join(folder, "package.json");
      if (fs.existsSync(metadata)) {
        const manifest = JSON.parse(fs.readFileSync(metadata, "utf8"));
        if (typeof manifest.name !== "string" || typeof manifest.version !== "string") return null;
        return { name: manifest.name, version: manifest.version, path: relative(metadata) };
      }
      folder = path.dirname(folder);
    }
    return null;
  };
  return {
    schemaVersion: 1,
    scope:
      "Esbuild inputs, outputs, and recorded sanitizer transformations only. This report does not cover copied assets, other transformations, external dependencies, dynamic loading, or complete source duties.",
    builds: builds.map(({ name, metafile, transformations = [] }) => {
      if (!metafile || !Object.keys(metafile.outputs).length) throw new Error("Build metadata is missing.");
      const inputs = new Map(Object.entries(metafile.inputs).map(([file, input]) => [relative(file), input]));
      const transformed = new Set();
      return {
        name,
        transformations: transformations.map((record) => {
          const source = relative(record.path);
          const replacement = relative(record.replacementPath);
          if (transformed.has(source)) throw new Error("Duplicate build transformation.");
          transformed.add(source);
          if (!inputs.has(source) || !inputs.has(replacement))
            throw new Error("A transformation is absent from build inputs.");
          if (
            !Buffer.isBuffer(record.original) ||
            !Buffer.isBuffer(record.replacement) ||
            typeof record.contents !== "string"
          )
            throw new Error("Invalid build transformation bytes.");
          if (record.contents.includes(root) || record.contents.includes(root.split(path.sep).join("/")))
            throw new Error("Transformation source contains a local path.");
          const bytes = Buffer.from(record.contents);
          if (
            inputs.get(source).bytes !== bytes.length ||
            inputs.get(replacement).bytes !== record.replacement.length
          )
            throw new Error("Transformation bytes do not match build inputs.");
          const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
          return {
            path: source,
            original: { bytes: record.original.length, sha256: hash(record.original) },
            transformed: { bytes: bytes.length, sha256: hash(bytes), contents: record.contents },
            replacement: {
              path: replacement,
              bytes: record.replacement.length,
              sha256: hash(record.replacement),
              package: packageFor(record.replacementPath),
            },
          };
        }),
        inputs: Object.entries(metafile.inputs).map(([file, input]) => ({
          path: relative(file),
          bytes: input.bytes,
          package: packageFor(file),
        })),
        outputs: Object.entries(metafile.outputs).map(([file, output]) => {
          const outputPath = relative(file);
          const bytes = fs.readFileSync(path.resolve(workingDirectory, file));
          return {
            path: outputPath,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.length,
            inputs: Object.entries(output.inputs).map(([input, contribution]) => ({
              path: relative(input),
              bytesInOutput: contribution.bytesInOutput,
            })),
            externalImports: output.imports
              .filter((entry) => entry.external)
              .map((entry) => ({ path: entry.path, kind: entry.kind }))
              .map((entry) => {
                if (path.isAbsolute(entry.path) || /^[^/]*:\//.test(entry.path) || entry.path.includes("\\"))
                  throw new Error("External import contains a local path.");
                return entry;
              }),
          };
        }),
      };
    }),
  };
}
