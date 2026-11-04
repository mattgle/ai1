import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { isUtf8 } from "node:buffer";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { reviewBackendExternalLoads } from "./review-backend-external-loads.mjs";
import { assertLoadedBuildInputsCaptured } from "./build-input-report.mjs";

const temporary = os.tmpdir();
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
const callerHashes = new Map([
  ["node_modules/ws/lib/buffer-util.js", "8b0a45739132f82e25ea13163780abf547ccfe989267f3eb7abb475beec92da3"],
  ["node_modules/ws/lib/validation.js", "41ce8e83d0d434132e1704895fedb91f6703a701b42d91c80954ab29b2845593"],
  [
    "node_modules/@parcel/watcher/index.js",
    "b341c2e73dbccb7ee08463534b7ebca32bb928ec5ea907b937e0d82501c03c73",
  ],
  [
    "node_modules/resolve-package-path/lib/index.js",
    "4a5ade60d4a7b6eff47cd67ec5913b325acd2626e75f0d3c4d98cebf3e950a4c",
  ],
  [
    "node_modules/@vscode/proxy-agent/out/index.js",
    "0be913187755ae7fec7aa813e794d19cca4cb21892c7ce22a686bc0dd4fb7ba0",
  ],
]);

function missingModule(target) {
  return Object.assign(new Error(`Cannot find module '${target}'`), { code: "MODULE_NOT_FOUND" });
}

function caller(file, load, globals = {}, expose = "") {
  const module = { exports: {} };
  const bytes = fs.readFileSync(path.join(workspace, file));
  assert.ok(callerHashes.has(file));
  assert.equal(identity(bytes).sha256, callerHashes.get(file), "Reviewed caller source changes");
  const source = bytes.toString("utf8");
  runInNewContext(
    source + expose,
    { module, exports: module.exports, require: load, Buffer, ...globals },
    {
      filename: file,
      timeout: 1000,
    },
  );
  return module.exports;
}

test("WebSocket masking uses its JavaScript fallback when bufferutil is missing", () => {
  const loads = [];
  const api = caller(
    "node_modules/ws/lib/buffer-util.js",
    (target) => {
      loads.push(target);
      if (target === "./constants") return { EMPTY_BUFFER: Buffer.alloc(0) };
      assert.equal(target, "bufferutil");
      throw missingModule(target);
    },
    { process: { env: {} } },
  );
  assert.deepEqual(loads, ["./constants", "bufferutil"]);
  const mask = Buffer.from([1, 2, 3, 4]);
  for (const length of [0, 1, 31, 32, 47, 48, 256]) {
    const source = Buffer.from(Array.from({ length }, (_, index) => index % 256));
    const output = Buffer.alloc(length + 4, 0xaa);
    api.mask(source, mask, output, 2, length);
    const expected = Buffer.from(source.map((byte, index) => byte ^ mask[index % 4]));
    assert.deepEqual(output.subarray(2, length + 2), expected);
    assert.deepEqual(output.subarray(0, 2), Buffer.from([0xaa, 0xaa]));
    assert.deepEqual(output.subarray(length + 2), Buffer.from([0xaa, 0xaa]));
    api.unmask(expected, mask);
    assert.deepEqual(expected, source);
  }
});

test("WebSocket UTF-8 validation skips the optional module with a builtin and falls back without one", () => {
  for (const builtin of [undefined, isUtf8]) {
    const loads = [];
    const api = caller(
      "node_modules/ws/lib/validation.js",
      (target) => {
        loads.push(target);
        if (target === "buffer") return { isUtf8: builtin };
        if (target === "./constants") return { hasBlob: false };
        assert.equal(target, "utf-8-validate");
        throw missingModule(target);
      },
      { process: { env: {} } },
    );
    assert.deepEqual(
      loads,
      builtin ? ["buffer", "./constants"] : ["buffer", "./constants", "utf-8-validate"],
    );
    const samples = [
      Buffer.alloc(0),
      Buffer.from("ASCII"),
      Buffer.from("é中😀"),
      Buffer.from([0xc0, 0xaf]),
      Buffer.from([0xed, 0xa0, 0x80]),
      Buffer.from([0xf4, 0x90, 0x80, 0x80]),
      Buffer.from([0xe2, 0x82]),
      Buffer.from([0x80]),
    ];
    for (const sample of samples) {
      for (const padding of [0, 24, 32, 256]) {
        const bytes = Buffer.concat([Buffer.alloc(padding, 0x61), sample]);
        assert.equal(api.isValidUTF8(bytes), isUtf8(bytes));
      }
    }
  }
});

test("watcher fallback selects Release before Debug and fails when all bindings are missing", () => {
  const platform = "@parcel/watcher-darwin-arm64";
  const release = "./build/Release/watcher.node";
  const debug = "./build/Debug/watcher.node";
  for (const selected of [platform, release, debug, undefined]) {
    const loads = [];
    const binding = {};
    const subscribe = () => {};
    const run = () =>
      caller(
        "node_modules/@parcel/watcher/index.js",
        (target) => {
          loads.push(target);
          if (target === "./wrapper")
            return {
              createWrapper(value) {
                assert.equal(value, binding);
                return { subscribe };
              },
            };
          assert.ok([platform, release, debug].includes(target));
          if (target === selected) return binding;
          throw missingModule(target);
        },
        { process: { platform: "darwin", arch: "arm64" } },
      );
    if (selected) assert.equal(run().subscribe, subscribe);
    else assert.throws(run, /No prebuild or local build/);
    const attempted = selected
      ? [platform, release, debug].slice(0, [platform, release, debug].indexOf(selected) + 1)
      : [platform, release, debug];
    assert.deepEqual(loads, ["./wrapper", ...attempted]);
  }
  for (const failed of [platform, release, debug]) {
    const loads = [];
    const error = Object.assign(new Error("Native binding failure"), { code: "ERR_DLOPEN_FAILED" });
    assert.throws(
      () =>
        caller(
          "node_modules/@parcel/watcher/index.js",
          (target) => {
            loads.push(target);
            if (target === "./wrapper") return {};
            if (target === failed) throw error;
            throw missingModule(target);
          },
          { process: { platform: "darwin", arch: "arm64" } },
        ),
      (actual) => actual === error,
    );
    assert.equal(loads.at(-1), failed);
  }
});

test("package-path resolution uses the standard resolver when pnpapi is missing", () => {
  const loads = [];
  const calls = [];
  class Cache {
    constructor() {
      this.cache = new Map();
      this.PATH = new Map();
    }
    get(key) {
      return this.cache.get(key);
    }
    set(key, value) {
      this.cache.set(key, value);
    }
  }
  const fallback = (cache, name, directory) => {
    calls.push({ name, directory, cache });
    return name === "present" ? "/fixture/present/package.json" : null;
  };
  const api = caller("node_modules/resolve-package-path/lib/index.js", (target) => {
    loads.push(target);
    if (target === "path") return path;
    if (target === "./resolve-package-path") return fallback;
    if (target === "./rethrow-unless-code")
      return () => {
        throw new Error("Unexpected PnP branch");
      };
    if (["./cache-group", "./cache"].includes(target)) return Cache;
    assert.equal(target, "pnpapi");
    throw missingModule(target);
  });
  assert.equal(loads.filter((target) => target === "pnpapi").length, 1);
  assert.equal(api("present", "/fixture"), "/fixture/present/package.json");
  assert.equal(api("absent", "/fixture"), null);
  assert.deepEqual(
    calls.map(({ name, directory }) => ({ name, directory })),
    [
      { name: "present", directory: "/fixture/" },
      { name: "absent", directory: "/fixture/" },
    ],
  );
  assert.ok(calls.every(({ cache }) => cache instanceof Cache));
});

test(
  "Windows certificate caller logs a missing module and continues without added certificates",
  { timeout: 3000 },
  async () => {
    const loads = [];
    const logs = [];
    const api = caller(
      "node_modules/@vscode/proxy-agent/out/index.js",
      (target) => {
        loads.push(target);
        if (["url", "os", "fs", "child_process", "./agent", "socks-proxy-agent"].includes(target)) return {};
        assert.equal(target, "@vscode/windows-ca-certs");
        throw missingModule(target);
      },
      { process: { platform: "win32" } },
      "\nexports.testUseSystemCertificates = useSystemCertificates;\n",
    );
    const params = { log: (...args) => logs.push(args) };
    const opts = {};
    const complete = () =>
      new Promise((resolve) => api.testUseSystemCertificates(params, true, opts, resolve));
    await complete();
    await complete();
    assert.deepEqual(opts, {});
    assert.equal(loads.filter((target) => target === "@vscode/windows-ca-certs").length, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], api.LogLevel.Error);
    assert.equal(logs[0][1], "ProxyResolver#getCaCertificates error");
    assert.match(logs[0][2], /windows-ca-certs/);
  },
);

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
