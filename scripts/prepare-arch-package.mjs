import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function isWithin(root, file) {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function checkPayload(folder, root = folder) {
  if (fs.statSync(folder).mode & 0o7022)
    throw new Error(`The package rejects special or writable file modes: ${folder}`);
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    const stat = fs.lstatSync(file);
    if (entry.isSymbolicLink()) {
      if (path.isAbsolute(fs.readlinkSync(file)) || !isWithin(root, fs.realpathSync(file)))
        throw new Error(`The package requires internal relative links: ${file}`);
    } else if (entry.isDirectory() || entry.isFile()) {
      if (stat.mode & 0o7022) throw new Error(`The package rejects special or writable file modes: ${file}`);
      if (entry.isDirectory()) checkPayload(file, root);
    } else {
      throw new Error(`Unsupported package file: ${file}`);
    }
  }
}

function noticeFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative))
    throw new Error("Invalid distribution notice path.");
  const file = path.resolve(root, relative);
  if (!isWithin(root, file) || !isWithin(root, fs.realpathSync(file)) || !fs.statSync(file).isFile())
    throw new Error("Invalid distribution notice file.");
  return file;
}

export function prepareArchPackage(input, output, root = checkout) {
  input = fs.realpathSync(input);
  output = path.resolve(output);
  if (fs.lstatSync(output, { throwIfNoEntry: false }))
    throw new Error("The output folder already exists. Use a new folder.");
  let parent = path.dirname(output);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (isWithin(input, path.resolve(fs.realpathSync(parent), path.relative(parent, output))))
    throw new Error("The output folder must be outside the app input.");
  checkPayload(input);
  const version = JSON.parse(
    fs.readFileSync(path.join(root, "applications/electron/package.json"), "utf8"),
  ).version;
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("The Arch package requires a stable numeric version.");
  const manifest = path.join(input, "resources/app/package.json");
  if (JSON.parse(fs.readFileSync(manifest, "utf8")).version !== version)
    throw new Error("The app version does not match the source version.");
  const executable = path.join(input, "ai1");
  if (!(fs.statSync(executable).mode & 0o111))
    throw new Error("The Linux app must have executable permission.");
  const header = fs.readFileSync(executable).subarray(0, 20);
  if (
    header.length < 20 ||
    header.readUInt32BE(0) !== 0x7f454c46 ||
    header[4] !== 2 ||
    header[5] !== 1 ||
    header.readUInt16LE(18) !== 62
  ) {
    throw new Error("The package requires a Linux x64 ELF executable.");
  }
  for (const file of [
    "LICENSE",
    "LICENSES.chromium.html",
    "resources/app/resources/branding/icon-dark.png",
    "resources/app/resources/notices/manifest.json",
  ]) {
    if (!fs.statSync(path.join(input, file)).isFile()) throw new Error(`Missing package file: ${file}`);
  }
  const notices = JSON.parse(
    fs.readFileSync(path.join(input, "resources/app/resources/notices/manifest.json"), "utf8"),
  );
  if (
    !notices ||
    notices.schemaVersion !== 1 ||
    !Array.isArray(notices.unresolved) ||
    !Array.isArray(notices.notices) ||
    !Array.isArray(notices.packages)
  )
    throw new Error("Invalid distribution notice manifest.");
  if (notices.unresolved.length)
    throw new Error("Distribution notices have unresolved entries. Complete the notice review first.");
  const noticeRoot = path.join(input, "resources/app/resources/notices");
  for (const notice of notices.notices) {
    if (!notice || typeof notice.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(notice.sha256))
      throw new Error("Invalid distribution notice checksum.");
    if (
      sha256(noticeFile(input, notice.path)) !== notice.sha256 ||
      sha256(noticeFile(noticeRoot, notice.text)) !== notice.sha256
    )
      throw new Error("Distribution notice checksum does not match the package files.");
  }
  fs.mkdirSync(output, { recursive: true });
  const staging = fs.mkdtempSync(path.join(output, ".stage-"));
  try {
    const app = path.join(staging, `ai1-${version}`);
    fs.cpSync(input, app, { recursive: true, dereference: false, verbatimSymlinks: true });
    const archive = `ai1-${version}-linux-x64.tar.gz`;
    execFileSync("tar", ["-czf", path.join(output, archive), "-C", staging, path.basename(app)]);
    for (const name of ["ai1", "ai1.desktop"])
      fs.copyFileSync(path.join(root, "packaging/arch", name), path.join(output, name));
    fs.copyFileSync(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
    const substitutions = {
      VERSION: version,
      ARCHIVE_SHA: sha256(path.join(output, archive)),
      LAUNCHER_SHA: sha256(path.join(output, "ai1")),
      DESKTOP_SHA: sha256(path.join(output, "ai1.desktop")),
      LICENSE_SHA: sha256(path.join(output, "LICENSE")),
    };
    const template = fs.readFileSync(path.join(root, "packaging/arch/PKGBUILD.in"), "utf8");
    fs.writeFileSync(
      path.join(output, "PKGBUILD"),
      template.replace(/@([A-Z_]+)@/g, (_, key) => substitutions[key]),
    );
    return path.join(output, "PKGBUILD");
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error("Use prepare-arch-package.mjs <linux-unpacked> <new-output-folder>.");
    console.log(prepareArchPackage(process.argv[2], process.argv[3]));
    console.log(
      "Package inputs are ready. No package is built or installed. Native runtime checks remain required.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
