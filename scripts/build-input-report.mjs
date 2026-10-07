import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { isBuiltin } from "node:module";

export function captureBuildPlugin(plugin, loadedSources, generatorPath) {
  if (!plugin?.name || typeof plugin.setup !== "function" || !Array.isArray(loadedSources))
    throw new Error("Invalid build plugin source capture.");
  return {
    name: plugin.name,
    setup(build) {
      let generator;
      build.onStart(() => {
        loadedSources.length = 0;
        generator = fs.readFileSync(generatorPath);
      });
      return plugin.setup({
        ...build,
        onLoad(options, callback) {
          build.onLoad(options, async (args) => {
            const result = await callback(args);
            if (result?.contents !== undefined) {
              if (typeof result.contents !== "string" && !(result.contents instanceof Uint8Array))
                throw new Error("Invalid loaded build source bytes.");
              const input = args.path + (args.suffix ?? "");
              loadedSources.push({
                path: args.namespace === "file" ? input : `${args.namespace}:${input}`,
                contents: Buffer.from(result.contents),
                loader: result.loader ?? null,
                plugin: plugin.name,
                generatorPath,
                generator: Buffer.from(generator),
              });
            }
            return result;
          });
        },
      });
    },
  };
}

export function assertLoadedBuildInputsCaptured(report) {
  if (!Array.isArray(report?.builds) || !report.builds.length)
    throw new Error("Build source coverage is missing.");
  for (const build of report.builds) {
    if (
      !Array.isArray(build.inputs) ||
      !build.inputs.length ||
      !Array.isArray(build.outputs) ||
      !build.outputs.length ||
      build.inputs.some(
        (input) =>
          !["captured-plugin-load", "captured-transformation"].includes(input.loadedSource?.status) ||
          !/^[a-f0-9]{64}$/.test(input.loadedSource?.sha256 ?? "") ||
          input.loadedSource.bytes !== input.bytes,
      ) ||
      build.outputs.some((output) => !Array.isArray(output.externalImports) || output.externalImports.length)
    )
      throw new Error("Loaded build sources or external runtime sources remain unverified.");
  }
  return {
    scope:
      "Loaded input bytes and absence of recorded external imports only. This does not verify generator dependencies, dynamic loads, or complete source duties.",
  };
}

export function buildInputReport(builds, root, workingDirectory) {
  root = path.resolve(root);
  const realRoot = fs.realpathSync(root);
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
  const sourceFor = (input) => {
    const virtual = virtualPath(input);
    if (virtual && !path.isAbsolute(virtual[2]))
      return { status: "not-captured", reason: "Virtual input has no on-disk source path." };
    let requested = path.resolve(workingDirectory, virtual ? virtual[2] : input);
    relative(requested);
    if (!fs.existsSync(requested) && /[?#]/.test(requested)) {
      requested = requested.split(/[?#]/, 1)[0];
      relative(requested);
    }
    const file = fs.realpathSync(requested);
    if (!file.startsWith(realRoot + path.sep) || !fs.statSync(file).isFile())
      throw new Error("Build input source escapes the repository or is not a file.");
    const bytes = fs.readFileSync(file);
    return {
      status: "on-disk",
      path: relative(requested),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  return {
    schemaVersion: 1,
    scope:
      "Esbuild inputs, outputs, sanitizer transformations, and supplied plugin load captures only. Generator dependencies, copied assets, uncaptured transformations, external runtime sources, dynamic loading, and complete source duties remain separate checks.",
    sourceHashScope:
      "On-disk input hashes at report time after each bundle build. These are not snapshots of every loaded or transformed input. Virtual inputs without source paths remain unverified.",
    loadedSourceScope:
      "Exact content returned by captured plugin onLoad callbacks and the recorded sanitizer transformation. Default loader bytes, nested generator dependencies, resolution redirects, dynamic loads, and unrecorded plugins remain unverified.",
    builds: builds.map(({ name, metafile, transformations = [], loadedSources = [] }) => {
      if (!metafile || !Object.keys(metafile.outputs).length) throw new Error("Build metadata is missing.");
      const inputs = new Map(Object.entries(metafile.inputs).map(([file, input]) => [relative(file), input]));
      if (inputs.size !== Object.keys(metafile.inputs).length)
        throw new Error("Duplicate normalized build input.");
      const transformed = new Set();
      const loaded = new Map();
      const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
      for (const record of loadedSources) {
        const source = relative(record.path);
        if (loaded.has(source)) throw new Error("Duplicate loaded build source.");
        if (!inputs.has(source)) throw new Error("A loaded source is absent from build inputs.");
        if (
          !Buffer.isBuffer(record.contents) ||
          !Buffer.isBuffer(record.generator) ||
          typeof record.plugin !== "string" ||
          !record.plugin ||
          !(record.loader === null || typeof record.loader === "string")
        )
          throw new Error("Invalid loaded build source record.");
        if (record.contents.length !== inputs.get(source).bytes)
          throw new Error("Loaded source bytes do not match build inputs.");
        if (record.plugin.includes(root) || record.plugin.includes(root.split(path.sep).join("/")))
          throw new Error("Build plugin name contains a local path.");
        const generator = sourceFor(record.generatorPath);
        if (generator.status !== "on-disk" || generator.sha256 !== hash(record.generator))
          throw new Error("The build generator changes after source capture.");
        loaded.set(source, {
          status: "captured-plugin-load",
          bytes: record.contents.length,
          sha256: hash(record.contents),
          loader: record.loader,
          plugin: record.plugin,
          generator: { ...generator, package: packageFor(record.generatorPath) },
          dependencyScope: "Generator implementation only. Its complete input dependencies are not captured.",
        });
      }
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
          if (loaded.has(source) && loaded.get(source).sha256 !== hash(bytes))
            throw new Error("Plugin load capture does not match the recorded transformation.");
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
        inputs: Object.entries(metafile.inputs).map(([file, input]) => {
          const inputPath = relative(file);
          const source = sourceFor(file);
          const transformation = transformations.find((record) => relative(record.path) === inputPath);
          return {
            path: inputPath,
            bytes: input.bytes,
            package: packageFor(file),
            source,
            loadedSource:
              loaded.get(inputPath) ??
              (transformation
                ? {
                    status: "captured-transformation",
                    bytes: Buffer.byteLength(transformation.contents),
                    sha256: hash(transformation.contents),
                  }
                : {
                    status: "not-captured",
                    reason: virtualPath(file)
                      ? "Virtual loader content is not captured. A referenced disk file does not verify it."
                      : source.bytes !== input.bytes
                        ? "Disk and metadata sizes differ without a captured transformation."
                        : "Report-time disk bytes do not verify the exact loaded bytes or exclude a same-size transformation.",
                  }),
          };
        }),
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
                return {
                  ...entry,
                  source: {
                    status: "not-captured",
                    kind: isBuiltin(entry.path)
                      ? "node-runtime"
                      : entry.path === "electron"
                        ? "electron-runtime"
                        : entry.path.startsWith("data:")
                          ? "embedded-url"
                          : "external-load",
                    reason:
                      "An external import is not a captured runtime source or a complete load inventory.",
                  },
                };
              }),
          };
        }),
      };
    }),
  };
}
