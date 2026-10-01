import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function checkLinuxTarget({ platform, arch, nodeVersion, uid, root, nodePath, npmPath }) {
  if (platform !== "linux")
    return "The Linux build requires Linux. Do not reuse macOS or Windows native dependencies.";
  if (arch !== "x64") return "The first Linux probe requires x64.";
  if (!Number.isSafeInteger(uid) || uid <= 0)
    return "The Linux build requires a normal Linux user, not root.";
  if (typeof nodeVersion !== "string" || !/^24\.\d+\.\d+$/.test(nodeVersion))
    return "The first Linux probe requires Linux Node 24. Do not change dependency pins.";
  for (const [name, value] of [
    ["checkout", root],
    ["Node", nodePath],
    ["npm", npmPath],
  ]) {
    if (
      typeof value !== "string" ||
      !path.posix.isAbsolute(value) ||
      /\.(exe|cmd|bat)$/i.test(value) ||
      /^\/mnt\/[a-z](?:\/|$)/i.test(value)
    ) {
      return `${name} must use a Linux path, not a mounted Windows drive or Windows executable.`;
    }
  }
  return undefined;
}

export function checkLinuxMode(mode) {
  if (mode === "--check" || mode === "--dir") return undefined;
  if (mode === "--deb")
    return "The .deb flow is blocked. Complete and review the WSL sandbox/keyring/native probe and provide approved maintainer metadata first.";
  return "Use --check or --dir. The .deb release flow remains blocked.";
}

function executableOnPath(name) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch {
      // Continue to the next PATH entry.
    }
  }
  return undefined;
}

export function runLinuxBuildCheck(mode, root) {
  const error = checkLinuxMode(mode);
  if (error) throw new Error(error);
  const npmPath = executableOnPath("npm");
  const targetError = checkLinuxTarget({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    uid: process.getuid?.(),
    root: fs.realpathSync(root),
    nodePath: fs.realpathSync(process.execPath),
    npmPath,
  });
  if (targetError) throw new Error(targetError);
  const commands = [
    [npmPath, ["--version"]],
    ["python3", ["--version"]],
    ["cc", ["--version"]],
    ["c++", ["--version"]],
    ["make", ["--version"]],
    ["pkg-config", ["--exists", "libsecret-1", "x11", "xkbfile"]],
  ];
  for (const [name, args] of commands) {
    const program = path.isAbsolute(name) ? name : executableOnPath(name);
    if (!program || /^\/mnt\/[a-z]\//i.test(program) || /\.(exe|cmd|bat)$/i.test(program)) {
      throw new Error(`${path.basename(name)} requires a Linux executable on PATH. See docs/wsl-setup.md.`);
    }
    const result = spawnSync(program, args, { timeout: 30_000, stdio: "ignore" });
    if (result.error || result.status !== 0) {
      throw new Error(
        `${path.basename(name)} prerequisite check fails. See docs/wsl-setup.md. No tools are installed by this script.`,
      );
    }
  }
  if (!fs.existsSync(path.join(root, "applications/electron/resources/branding/icon-dark.png"))) {
    throw new Error("The Linux PNG icon is missing.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error("Use linux-build-check.mjs <mode> <checkout>.");
    runLinuxBuildCheck(process.argv[2], process.argv[3]);
    console.log("Linux build prerequisites pass. WSL runtime compatibility remains unverified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
