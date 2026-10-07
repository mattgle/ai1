import * as fs from "node:fs";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath, URL } from "node:url";
import tar from "tar-stream";

const resourceRoot = fileURLToPath(
  new URL("../applications/electron/resources/third-party/ffmpeg-source/", import.meta.url),
);

export function verifySourceBytes(bytes, expected) {
  if (
    bytes.length !== expected.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== expected.sha256
  ) {
    throw new Error("Source bytes do not match the reviewed size and SHA-256.");
  }
}

export async function readReviewedTarFiles(bytes, records) {
  const expected = new Map(records.map((record) => [record.path, record]));
  if (expected.size !== records.length) throw new Error("Duplicate source file record.");
  const files = new Map();
  const extract = tar.extract();
  let entries = 0;
  await new Promise((resolve, reject) => {
    extract.on("error", reject);
    extract.on("finish", resolve);
    extract.on("entry", (header, stream, next) => {
      entries++;
      const record = expected.get(header.name);
      stream.on("error", (error) => extract.destroy(error));
      if (!record) {
        stream.on("end", next);
        stream.resume();
        return;
      }
      if (files.has(header.name) || header.type !== "file" || header.size !== record.bytes) {
        stream.resume();
        extract.destroy(new Error("Duplicate, non-file, or wrong-size source entry."));
        return;
      }
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        try {
          const contents = Buffer.concat(chunks);
          verifySourceBytes(contents, record);
          files.set(header.name, contents);
          next();
        } catch (error) {
          extract.destroy(error);
        }
      });
    });
    extract.end(bytes);
  });
  if (files.size !== expected.size) throw new Error("A reviewed source file is absent.");
  return { files, entries };
}

export function patchReviewedBuildFile(bytes) {
  const source = bytes.toString("utf8");
  const before = '        ldflags += [ "-Wl,-install_name,@rpath/libffmpeg.dylib" ]';
  const after = '        ldflags += [ "-Wl,-install_name,@loader_path/libffmpeg.dylib" ]';
  if (source.split(before).length !== 2 || source.includes(after)) {
    throw new Error("The reviewed install-name line is absent or ambiguous.");
  }
  return Buffer.from(source.replace(before, after));
}

export async function reviewFfmpegSource(archivePath) {
  const review = JSON.parse(fs.readFileSync(path.join(resourceRoot, "source-review.json"), "utf8"));
  const source = review.ffmpeg;
  const bytes = fs.readFileSync(archivePath);
  verifySourceBytes(bytes, { bytes: source.archiveBytes, sha256: source.archiveSha256 });
  for (const input of review.retainedInputs) {
    if (path.basename(input.path) !== input.path) throw new Error("Invalid retained source path.");
    const file = path.join(resourceRoot, input.path);
    if (!fs.lstatSync(file).isFile()) throw new Error("A retained source input is not a regular file.");
    verifySourceBytes(fs.readFileSync(file), input);
  }
  const contents = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
  const { files, entries } = await readReviewedTarFiles(contents, source.files);
  if (entries !== source.archiveEntries) throw new Error("The source entry count does not match.");
  const patched = patchReviewedBuildFile(files.get("BUILD.gn"));
  verifySourceBytes(patched, source.patchedBuildFile);
  return {
    revision: source.revision,
    archiveSha256: source.archiveSha256,
    archiveEntries: entries,
    files: source.files,
    retainedInputs: review.retainedInputs,
    patchedBuildFile: {
      bytes: patched.length,
      sha256: source.patchedBuildFile.sha256,
      method: "In-memory install-name replacement with verified input and output hashes.",
    },
    scope: "Source byte checks only. This does not verify binary equivalence or legal compliance.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Use: node scripts/review-ffmpeg-source.mjs <archive>");
    console.log(JSON.stringify(await reviewFfmpegSource(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
