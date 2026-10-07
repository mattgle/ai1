import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createRequire, isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

const limit = 16 * 1024 * 1024;
const prefix = "applications/electron/";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const helpers = [
  {
    target: "ai1-agents/lib/node/terminal-attention-hook",
    file: "terminal-attention-hook.js",
    bytes: 3653,
    sha256: "c843cc41310886444dbf1c3bf762e8f1c1808e6207d664ba92bf229f67815169",
  },
  {
    target: "ai1-agents/lib/node/session-shell-runner",
    file: "session-shell-runner.js",
    bytes: 2161,
    sha256: "795eb67a275415dad9448db8cb6e807ed9f218ffa127110de93c662b29a840fe",
  },
];
const classifications = new Map([
  ["bufferutil", "optional-native"],
  ["utf-8-validate", "optional-native"],
  ["pnpapi", "package-manager-integration"],
  ["./build/Debug/watcher.node", "native-fallback"],
  ["@vscode/windows-ca-certs", "platform-specific-native"],
  ...helpers.map((helper) => [helper.target, "copied-ai1-helper"]),
]);

function readFile(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    path.isAbsolute(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid reviewed file path.");
  let file = root;
  for (const part of relative.split("/")) {
    file = path.join(file, part);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error("A reviewed path contains a link.");
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error("A reviewed file is non-file or too large.");
  const bytes = fs.readFileSync(file);
  if (bytes.length > limit) throw new Error("A reviewed file exceeds the byte limit.");
  return bytes;
}

function verify(bytes, identity) {
  if (bytes.length !== identity.bytes || hash(bytes) !== identity.sha256)
    throw new Error("Reviewed file bytes do not match their identity.");
}

export function reviewBackendExternalLoads(payload, production) {
  payload = fs.realpathSync(payload);
  production = fs.realpathSync(production);
  const relative = "resources/release/build-inputs.json";
  const bytes = readFile(payload, relative);
  if (!bytes.equals(readFile(production, relative)))
    throw new Error("Packaged and production reports differ.");
  const report = JSON.parse(bytes);
  const backends = report.builds?.filter((build) => build.name === "node");
  if (report.schemaVersion !== 1 || backends?.length !== 1) throw new Error("Invalid backend report.");
  const backend = backends[0];
  if (!Array.isArray(backend.outputs) || !backend.outputs.length || backend.outputs.length > 32)
    throw new Error("Invalid backend outputs.");
  const seenOutputs = new Set();
  const seenTargets = new Set();
  const loads = [];
  for (const output of backend.outputs) {
    if (
      !output.path?.startsWith(prefix + "lib/backend/") ||
      seenOutputs.has(output.path) ||
      !Array.isArray(output.externalImports) ||
      output.externalImports.length > 4096
    )
      throw new Error("Invalid or duplicate backend output.");
    seenOutputs.add(output.path);
    const file = output.path.slice(prefix.length);
    verify(readFile(payload, file), output);
    const require = createRequire(path.join(payload, file));
    const seenImports = new Set();
    for (const entry of output.externalImports) {
      if (typeof entry.path !== "string" || typeof entry.kind !== "string")
        throw new Error("Invalid external import.");
      if (isBuiltin(entry.path) || entry.path === "electron") continue;
      const classification = classifications.get(entry.path);
      const helper = helpers.find((item) => item.target === entry.path);
      const key = `${entry.path}:${entry.kind}`;
      if (
        !classification ||
        entry.kind !== (helper ? "require-resolve" : "require-call") ||
        entry.source?.status !== "not-captured" ||
        seenImports.has(key)
      )
        throw new Error("Unknown, changed, or duplicate external load remains unresolved.");
      seenImports.add(key);
      seenTargets.add(entry.path);
      const record = {
        output: file,
        target: entry.path,
        kind: entry.kind,
        classification,
        status: "unresolved",
        sourceCoverage: "not-captured",
      };
      let resolved;
      try {
        resolved = require.resolve(entry.path);
      } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND" || helper) throw error;
        record.resolution = "MODULE_NOT_FOUND";
      }
      if (resolved) {
        const candidate = path.relative(payload, resolved).split(path.sep).join("/");
        const source = readFile(payload, candidate);
        record.resolution = "resolved-file";
        record.file = { path: candidate, bytes: source.length, sha256: hash(source) };
        if (helper) {
          if (candidate !== `node_modules/ai1-agents/lib/node/${helper.file}`)
            throw new Error("An Agents target resolves to an unexpected file.");
          verify(source, helper);
          verify(
            readFile(
              fs.realpathSync(path.resolve(production, "../..")),
              `extensions/agents/lib/node/${helper.file}`,
            ),
            helper,
          );
          record.status = "verified-helper-identity-only";
        }
      }
      loads.push(record);
    }
  }
  if (seenTargets.size !== classifications.size) throw new Error("A reviewed external target is missing.");
  return {
    schemaVersion: 1,
    scope:
      "Recorded backend external loads and two hash-pinned copied Agents helper identities only. Resolution does not execute modules. Missing optional paths remain unresolved, not safe or unreachable. Helper dependencies, TypeScript compilation, runtime branches, nonliteral loads, complete loaded inputs, and source and license duties remain unverified. Existing release gates remain unchanged.",
    reportSha256: hash(bytes),
    verifiedBackendOutputs: seenOutputs.size,
    loads,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        "Use: node scripts/review-backend-external-loads.mjs <packaged-app-resources> <production-app-folder>",
      );
    console.log(JSON.stringify(reviewBackendExternalLoads(process.argv[2], process.argv[3]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
