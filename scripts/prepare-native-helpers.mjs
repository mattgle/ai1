import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export function prepareNativeHelpers({ payload, platform, arch }) {
  if (!((platform === "darwin" && arch === "arm64") || (platform === "linux" && arch === "x64"))) {
    throw new Error("Native helper preparation requires a reviewed packaging target.");
  }
  const files = [
    { path: "lib/backend/native/rg", mode: 0o755 },
    { path: `lib/prebuilds/${platform}-${arch}/pty.node`, mode: 0o644 },
    ...(platform === "darwin"
      ? [
          { path: "lib/backend/macos-trash", mode: 0o755 },
          { path: "lib/prebuilds/darwin-arm64/spawn-helper", mode: 0o755 },
        ]
      : []),
  ];
  return {
    platform,
    arch,
    scope:
      "Known copied helper bytes and packaging modes only. This does not verify complete source or license duties.",
    files: prepareFileModes(payload, files),
  };
}

export function prepareBrandingModes({ payload }) {
  return {
    scope: "Known packaged branding copies only. Source files stay unchanged.",
    files: prepareFileModes(payload, [
      { path: "resources/branding/logo-dark.png", mode: 0o644 },
      { path: "resources/branding/logo-light.png", mode: 0o644 },
    ]),
  };
}

function prepareFileModes(payload, files) {
  const root = fs.realpathSync(payload);
  const records = files.map((entry) => {
    const file = path.join(root, entry.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || !fs.realpathSync(file).startsWith(root + path.sep)) {
      throw new Error("A copied file is linked, non-file, or outside the payload.");
    }
    return {
      ...entry,
      file,
      device: stat.dev,
      inode: stat.ino,
      originalMode: stat.mode & 0o7777,
      bytes: stat.size,
      sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    };
  });
  for (const entry of records) {
    const descriptor = fs.openSync(entry.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.dev !== entry.device || stat.ino !== entry.inode) {
        throw new Error("A copied file changes after path validation.");
      }
      fs.fchmodSync(descriptor, entry.mode);
      if (
        (fs.fstatSync(descriptor).mode & 0o7777) !== entry.mode ||
        createHash("sha256").update(fs.readFileSync(descriptor)).digest("hex") !== entry.sha256
      ) {
        throw new Error("A copied file changes bytes or fails its packaged mode check.");
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }
  return records.map((entry) => ({
    path: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
    originalMode: entry.originalMode,
    packagedMode: entry.mode,
  }));
}
