import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { readReviewedTarFiles, verifySourceBytes } from "./review-ffmpeg-source.mjs";
import { verifyArchive } from "./review-theia-source.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readContainedFile(root, relative) {
  const file = path.join(root, relative);
  if (!fs.lstatSync(file).isFile() || !fs.realpathSync(file).startsWith(root + path.sep)) {
    throw new Error("A reviewed helper input is linked, non-file, or outside its folder.");
  }
  return fs.readFileSync(file);
}

export function nativeHelperInputs(report) {
  const { platform, arch } = report;
  if (!((platform === "darwin" && arch === "arm64") || (platform === "linux" && arch === "x64"))) {
    throw new Error("Unreviewed native helper target.");
  }
  const inputs = [
    {
      path: "lib/backend/native/rg",
      package: `@vscode/ripgrep-${platform}-${arch}`,
      source: "bin/rg",
      mode: 0o755,
    },
    {
      path: `lib/prebuilds/${platform}-${arch}/pty.node`,
      package: "node-pty",
      source: `prebuilds/${platform}-${arch}/pty.node`,
      mode: 0o644,
    },
    ...(platform === "darwin"
      ? [
          { path: "lib/backend/macos-trash", package: "trash", source: "lib/macos-trash", mode: 0o755 },
          {
            path: "lib/prebuilds/darwin-arm64/spawn-helper",
            package: "node-pty",
            source: "prebuilds/darwin-arm64/spawn-helper",
            mode: 0o755,
          },
        ]
      : []),
  ];
  if (!Array.isArray(report.files) || report.files.length !== inputs.length) {
    throw new Error("The native helper inventory changes.");
  }
  const records = new Map(report.files.map((entry) => [entry.path, entry]));
  if (records.size !== inputs.length) throw new Error("Duplicate native helper record.");
  return inputs.map((input) => {
    const record = records.get(input.path);
    if (
      !record ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes <= 0 ||
      record.bytes > 16 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? "") ||
      record.packagedMode !== input.mode
    ) {
      throw new Error("Invalid native helper bytes, path, hash, or mode.");
    }
    return { ...input, bytes: record.bytes, sha256: record.sha256 };
  });
}

export async function reviewNativeHelperSource(payload, lockfile, archiveDirectory) {
  payload = fs.realpathSync(payload);
  archiveDirectory = fs.realpathSync(archiveDirectory);
  const manifest = readContainedFile(payload, "resources/release/native-helpers.json");
  const report = JSON.parse(manifest);
  const inputs = nativeHelperInputs(report);
  const lock = JSON.parse(fs.readFileSync(lockfile, "utf8"));
  for (const input of inputs) {
    verifySourceBytes(readContainedFile(payload, input.path), input);
    if ((fs.statSync(path.join(payload, input.path)).mode & 0o7777) !== input.mode) {
      throw new Error("A packaged helper has an unsafe mode.");
    }
  }
  const packages = [];
  for (const name of [...new Set(inputs.map((input) => input.package))]) {
    const locked = lock.packages?.[`node_modules/${name}`];
    if (!locked?.version || !locked.resolved) throw new Error("A helper package has no lock entry.");
    const url = new URL(locked.resolved);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "registry.npmjs.org" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("A helper archive has an unreviewed registry source.");
    }
    const archiveName = url.pathname.split("/").at(-1);
    if (!/^[A-Za-z0-9_.-]+\.tgz$/.test(archiveName)) throw new Error("Invalid local helper archive name.");
    const metadata = JSON.parse(readContainedFile(payload, `node_modules/${name}/package.json`));
    if (metadata.name !== name || metadata.version !== locked.version) {
      throw new Error("The packaged helper dependency does not match the lockfile.");
    }
    const archive = readContainedFile(archiveDirectory, archiveName);
    verifyArchive(archive, locked.integrity);
    const selected = inputs.filter((input) => input.package === name);
    await readReviewedTarFiles(
      gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 }),
      selected.map((input) => ({
        path: `package/${input.source}`,
        bytes: input.bytes,
        sha256: input.sha256,
      })),
    );
    packages.push({
      name,
      version: locked.version,
      archive: archiveName,
      url: url.href,
      integrity: locked.integrity,
      archiveBytes: archive.length,
      archiveSha256: hash(archive),
      files: selected.map((input) => ({
        path: input.path,
        archivePath: `package/${input.source}`,
        bytes: input.bytes,
        sha256: input.sha256,
        mode: input.mode,
      })),
    });
  }
  return {
    scope:
      "Published archive and copied helper byte matches only. Complete compilation inputs and source and license duties remain unverified.",
    platform: report.platform,
    arch: report.arch,
    manifestSha256: hash(manifest),
    packages,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) {
      throw new Error(
        "Use: node scripts/review-native-helper-source.mjs <packaged-app-resources> <local-archive-folder>",
      );
    }
    const lockfile = fileURLToPath(new URL("../package-lock.json", import.meta.url));
    console.log(
      JSON.stringify(await reviewNativeHelperSource(process.argv[2], lockfile, process.argv[3]), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
