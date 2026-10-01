import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanner = process.env.GITLEAKS_BIN || "gitleaks";
const version = spawnSync(scanner, ["version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.error(
    "Install Gitleaks 8.30.1 or set GITLEAKS_BIN to its executable. No tools are installed by this script.",
  );
  process.exit(1);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-secret-review-"));
const snapshot = path.join(directory, "source");
fs.mkdirSync(snapshot);
const listing = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
});
if (listing.error || listing.status !== 0) {
  console.error("Git cannot list the source files. The scan does not run.");
  process.exit(1);
}
for (const name of new Set(listing.stdout.split("\0").filter(Boolean))) {
  const source = path.resolve(root, name);
  const target = path.resolve(snapshot, name);
  if (!source.startsWith(root + path.sep) || !target.startsWith(snapshot + path.sep)) {
    throw new Error("A source path is outside the checkout. Review it before scanning.");
  }
  if (!fs.existsSync(source)) continue;
  if (!fs.lstatSync(source).isFile()) {
    throw new Error("A source entry is not a regular file. Review it before scanning.");
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

let failed = false;
for (const [mode, source, extra] of [
  ["git", root, ["--log-opts=--all"]],
  ["dir", snapshot, []],
]) {
  const report = path.join(directory, `${mode}-secrets.json`);
  const result = spawnSync(
    scanner,
    [
      mode,
      source,
      "--redact=100",
      "--no-banner",
      "--config",
      path.join(root, ".gitleaks.toml"),
      "--report-format=json",
      "--report-path",
      report,
      ...extra,
    ],
    { cwd: root, encoding: "utf8" },
  );
  fs.writeFileSync(path.join(directory, `${mode}-scan.log`), result.stderr || "");
  if (result.error || result.status !== 0) failed = true;
  console.log(`${mode} scan: ${result.status === 0 ? "passes" : "requires review"}.`);
}
console.log(`Redacted reports: ${directory}`);
console.log(
  "This scan covers local Git refs and tracked or untracked source files. It does not prove that no secrets exist.",
);
process.exitCode = failed ? 1 : 0;
