import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { reviewBackendExternalLoads } from "./review-backend-external-loads.mjs";
import { assertLoadedBuildInputsCaptured } from "./build-input-report.mjs";

const temporary = "/private/var/folders/hw/89fpk6ms2zdf8v1wscn5gdm00000gn/T/opencode";
const workspace = fileURLToPath(new URL("../", import.meta.url));
const targets = [
  "bufferutil",
  "utf-8-validate",
  "pnpapi",
  "./build/Debug/watcher.node",
  "@vscode/windows-ca-certs",
  "ai1-agents/lib/node/terminal-attention-hook",
  "ai1-agents/lib/node/session-shell-runner",
];
const identity = (bytes) => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(temporary, "ai1-external-loads-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "payload");
  const production = path.join(root, "applications/electron");
  const write = (base, file, bytes) => {
    const target = path.join(base, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  };
  const output = Buffer.from('throw new Error("Inventory must not execute the backend");\n');
  write(payload, "lib/backend/main.js", output);
  write(payload, "node_modules/ai1-agents/package.json", '{"name":"ai1-agents","version":"0.1.0"}');
  for (const name of ["terminal-attention-hook", "session-shell-runner"]) {
    const file = `extensions/agents/lib/node/${name}.js`;
    const bytes = fs.readFileSync(path.join(workspace, file));
    write(root, file, bytes);
    write(payload, `node_modules/ai1-agents/lib/node/${name}.js`, bytes);
  }
  const report = {
    schemaVersion: 1,
    builds: [
      {
        name: "node",
        inputs: [{ loadedSource: { status: "not-captured" } }],
        outputs: [
          {
            path: "applications/electron/lib/backend/main.js",
            ...identity(output),
            externalImports: targets.map((target) => ({
              path: target,
              kind: target.startsWith("ai1-") ? "require-resolve" : "require-call",
              source: { status: "not-captured" },
            })),
          },
        ],
      },
    ],
  };
  const save = () => {
    for (const base of [production, payload])
      write(base, "resources/release/build-inputs.json", JSON.stringify(report));
  };
  save();
  return { root, payload, production, report, save, write };
}

test("offline inventory verifies helpers without executing them and keeps missing targets unresolved", (t) => {
  const f = fixture(t);
  const result = reviewBackendExternalLoads(f.payload, f.production);
  assert.equal(result.verifiedBackendOutputs, 1);
  assert.equal(result.loads.length, 7);
  assert.equal(result.loads.filter((entry) => entry.status === "verified-helper-identity-only").length, 2);
  for (const entry of result.loads.slice(0, 5)) {
    assert.equal(entry.status, "unresolved");
    assert.equal(entry.resolution, "MODULE_NOT_FOUND");
  }
  assert.match(result.scope, /not safe or unreachable/);
  assert.throws(() => assertLoadedBuildInputsCaptured(f.report), /remain unverified/);
});

test("a present optional module stays unresolved and does not execute", (t) => {
  const f = fixture(t);
  f.write(f.payload, "node_modules/bufferutil/index.js", 'throw new Error("Do not execute");');
  const entry = reviewBackendExternalLoads(f.payload, f.production).loads[0];
  assert.equal(entry.status, "unresolved");
  assert.equal(entry.resolution, "resolved-file");
  assert.equal(entry.file.path, "node_modules/bufferutil/index.js");
});

test("changed or missing helper bytes fail", (t) => {
  const f = fixture(t);
  const file = "node_modules/ai1-agents/lib/node/session-shell-runner.js";
  f.write(f.payload, file, "changed");
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /identity/);
  fs.unlinkSync(path.join(f.payload, file));
  assert.throws(
    () => reviewBackendExternalLoads(f.payload, f.production),
    (error) => ["MODULE_NOT_FOUND", "ENOENT"].includes(error.code),
  );
});

test("helper links and redirected resolution fail", (t) => {
  const f = fixture(t);
  const file = path.join(f.payload, "node_modules/ai1-agents/lib/node/session-shell-runner.js");
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(f.root, "extensions/agents/lib/node/session-shell-runner.js"), file);
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /path|unexpected/);
});

test("an optional module from outside the package is not accepted as payload evidence", (t) => {
  const f = fixture(t);
  f.write(f.root, "node_modules/bufferutil/index.js", 'throw new Error("Do not execute");');
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /path/);
});

test("changed production helper bytes and linked backend outputs fail", (t) => {
  const f = fixture(t);
  f.write(f.root, "extensions/agents/lib/node/terminal-attention-hook.js", "changed");
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /identity/);
  const output = path.join(f.payload, "lib/backend/main.js");
  fs.renameSync(output, output + ".original");
  fs.symlinkSync(output + ".original", output);
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /link/);
});

test("changed or oversized backend outputs fail", (t) => {
  const f = fixture(t);
  f.write(f.payload, "lib/backend/main.js", "changed");
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /identity/);
  fs.truncateSync(path.join(f.payload, "lib/backend/main.js"), 16 * 1024 * 1024 + 1);
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /too large/);
});

test("unknown, missing, duplicate, or changed-kind external records fail", (t) => {
  const f = fixture(t);
  const imports = f.report.builds[0].outputs[0].externalImports;
  imports.push({ ...imports[0], path: "unreviewed-helper" });
  f.save();
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /unresolved/);
  imports.pop();
  const removed = imports.pop();
  f.save();
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /missing/);
  imports.push(removed, { ...imports[0] });
  f.save();
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /duplicate/);
  imports.pop();
  imports[0].kind = "dynamic-import";
  f.save();
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /changed/);
});

test("changed production report and escaping output paths fail", (t) => {
  const f = fixture(t);
  f.write(f.production, "resources/release/build-inputs.json", "{}");
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /reports differ/);
  f.report.builds[0].outputs[0].path = "applications/electron/lib/backend/../../outside.js";
  f.save();
  assert.throws(() => reviewBackendExternalLoads(f.payload, f.production), /path/);
});
