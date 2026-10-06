import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";

const require = createRequire(import.meta.url);
const version = "42.11.8";
const archives = {
  "darwin-arm64": "ac0ee66fa9416ff93b06124a2ea89868b393d1388276ce963a9706889c142a21",
  "linux-x64": "c6585e86f3980291c1b598a47c338439ea400bce5f5198149f9706962caa4b7b",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function packagedFfmpegPath(appRoot, platform, arch, electronVersion) {
  if (electronVersion !== version || !archives[`${platform}-${arch}`])
    throw new Error("Unsupported packaged FFmpeg target or Electron version.");
  return path.join(
    appRoot,
    platform === "darwin"
      ? "Frameworks/Electron Framework.framework/Libraries/libffmpeg.dylib"
      : "libffmpeg.so",
  );
}

function cleanCodecs(file, inspect) {
  const codecs = inspect(file);
  if (
    !Array.isArray(codecs) ||
    !codecs.length ||
    codecs.some((codec) => typeof codec?.name !== "string" || !codec.name.trim())
  )
    throw new Error("Packaged FFmpeg codec inspection returns no valid codecs.");
  const names = codecs.map((codec) => codec.name.trim().toLowerCase()).sort();
  if (names.includes("h264") || names.includes("aac"))
    throw new Error("Packaged FFmpeg contains H.264 or AAC.");
  return names;
}

export function packagedFfmpegEntry(archive, name) {
  const matches = archive.files.filter((file) => file.path === name);
  if (matches.length !== 1) throw new Error("The FFmpeg archive must contain exactly one target library.");
  const file = matches[0];
  const mode = (file.externalFileAttributes >>> 16) & 0o170000;
  if (
    !Number.isInteger(file.externalFileAttributes) ||
    file.externalFileAttributes & 0x10 ||
    (mode !== 0 && mode !== 0o100000) ||
    !(file.uncompressedSize > 0) ||
    typeof file.buffer !== "function"
  )
    throw new Error("The FFmpeg archive library is not a regular file.");
  return file;
}

export function replacePackagedFfmpeg(
  appRoot,
  target,
  bytes,
  inspect = require("@theia/ffmpeg").getFfmpegCodecs,
) {
  const root = fs.realpathSync(appRoot);
  const destination = fs.realpathSync(target);
  if (!destination.startsWith(root + path.sep) || !fs.statSync(destination).isFile())
    throw new Error("Packaged FFmpeg path escapes the app or is not a file.");
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error("Invalid packaged FFmpeg bytes.");
  const temporary = path.join(
    path.dirname(destination),
    `.ai1-ffmpeg-${randomUUID()}${path.extname(destination)}`,
  );
  let created = false;
  let descriptor;
  try {
    const mode = fs.statSync(destination).mode & 0o777;
    descriptor = fs.openSync(temporary, "wx", mode);
    created = true;
    fs.fchmodSync(descriptor, mode);
    fs.writeFileSync(descriptor, bytes);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const names = cleanCodecs(temporary, inspect);
    fs.renameSync(temporary, destination);
    created = false;
    const installed = fs.readFileSync(destination);
    if (!installed.equals(bytes)) throw new Error("Packaged FFmpeg bytes change during replacement.");
    if (JSON.stringify(cleanCodecs(destination, inspect)) !== JSON.stringify(names))
      throw new Error("Packaged FFmpeg codec results change after replacement.");
    return { bytes: installed.length, sha256: hash(installed), codecs: names };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (created) fs.unlinkSync(temporary);
  }
}

export async function preparePackagedFfmpeg(options, dependencies = {}) {
  const { appRoot, platform, arch, electronVersion } = options;
  const target = packagedFfmpegPath(appRoot, platform, arch, electronVersion);
  if (platform !== process.platform || arch !== process.arch)
    throw new Error("Packaged FFmpeg inspection requires a native target host.");
  const fileName = `ffmpeg-v${version}-${platform}-${arch}.zip`;
  const checksum = archives[`${platform}-${arch}`];
  const download = dependencies.downloadArtifact ?? require("@electron/get").downloadArtifact;
  const archivePath = await download({
    version,
    platform,
    arch,
    artifactName: "ffmpeg",
    checksums: { [fileName]: checksum },
  });
  const archiveBytes = fs.readFileSync(archivePath);
  if (hash(archiveBytes) !== checksum) throw new Error("Packaged FFmpeg archive checksum mismatch.");
  const open = dependencies.openArchive ?? require("unzipper").Open.buffer;
  const archive = await open(archiveBytes);
  const entry = packagedFfmpegEntry(archive, path.basename(target));
  const bytes = await entry.buffer();
  const result = replacePackagedFfmpeg(appRoot, target, bytes, dependencies.inspect);
  return {
    schemaVersion: 1,
    electronVersion,
    platform,
    arch,
    source: {
      file: fileName,
      sha256: checksum,
      url: `https://github.com/electron/electron/releases/download/v${version}/${fileName}`,
    },
    library: { path: path.relative(appRoot, target).split(path.sep).join("/"), ...result },
    scope:
      "Library bytes and codec names before signing. Signing can change binary bytes. This does not establish license or corresponding-source compliance.",
  };
}
