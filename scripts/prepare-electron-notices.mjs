import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";

const require = createRequire(import.meta.url);
const version = "42.11.8";
const notices = {
  LICENSE: "5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d",
  "LICENSES.chromium.html": "ca0a3f71df977796bf39a99472783c1ce9378bf4d8f4142a95048c3843980415",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function writeVerifiedRuntimeNotice(bytes, destination, checksum, payload) {
  if (!Buffer.isBuffer(bytes) || hash(bytes) !== checksum) throw new Error("Electron notice hash mismatch.");
  const root = fs.realpathSync(payload);
  const directory = fs.realpathSync(path.dirname(destination));
  if (directory !== root && !directory.startsWith(root + path.sep))
    throw new Error("Electron notice destination escapes the payload.");
  destination = path.join(directory, path.basename(destination));
  const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isFile() || hash(fs.readFileSync(destination)) !== checksum)
      throw new Error("Existing Electron notice does not match the reviewed bytes.");
    return;
  }
  const temporary = path.join(directory, `.ai1-runtime-notice-${randomUUID()}`);
  let descriptor;
  let created = false;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o644);
    created = true;
    fs.fchmodSync(descriptor, 0o644);
    fs.writeFileSync(descriptor, bytes);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporary, destination);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (created) fs.unlinkSync(temporary);
  }
}

export function prepareElectronNotices({
  payload,
  electronVersion,
  electronDist = path.join(path.dirname(require.resolve("electron/package.json")), "dist"),
}) {
  if (
    electronVersion !== version ||
    fs.readFileSync(path.join(electronDist, "version"), "utf8").trim() !== version
  )
    throw new Error("Electron runtime notice version mismatch.");
  const source = fs.realpathSync(electronDist);
  const assets = Object.entries(notices).map(([name, checksum]) => {
    const file = fs.realpathSync(path.join(source, name));
    if (!file.startsWith(source + path.sep))
      throw new Error("Electron notice source escapes its distribution.");
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== checksum) throw new Error(`Electron notice hash mismatch: ${name}`);
    return { name, checksum, bytes };
  });
  const root = fs.realpathSync(payload);
  let directory = root;
  for (const segment of ["resources", "third-party", "electron"]) {
    const child = path.join(directory, segment);
    if (!fs.lstatSync(child, { throwIfNoEntry: false })) fs.mkdirSync(child);
    directory = fs.realpathSync(child);
    if (!directory.startsWith(root + path.sep) || !fs.statSync(directory).isDirectory())
      throw new Error("Electron notice directory escapes the payload or is not a directory.");
  }
  for (const asset of assets)
    writeVerifiedRuntimeNotice(asset.bytes, path.join(directory, asset.name), asset.checksum, payload);
  return {
    schemaVersion: 1,
    electronVersion,
    notices: assets.map((asset) => ({
      path: `resources/third-party/electron/${asset.name}`,
      bytes: asset.bytes.length,
      sha256: asset.checksum,
    })),
    scope:
      "Complete unchanged Electron and Chromium notices from the verified 42.11.8 runtime archives. This does not establish all corresponding-source duties.",
  };
}
