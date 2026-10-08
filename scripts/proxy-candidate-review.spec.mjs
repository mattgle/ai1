import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire, Module } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import * as net from "node:net";

const require = createRequire(import.meta.url);
const resources = process.env.AI1_PROXY_CANDIDATE_RESOURCES;

function candidateRoot() {
  assert.ok(resources, "Set AI1_PROXY_CANDIDATE_RESOURCES to an isolated candidate folder");
  assert.equal(fs.lstatSync(resources).isSymbolicLink(), false);
  const root = fs.realpathSync(resources);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(root, "node_modules/@vscode/proxy-agent/package.json")),
  );
  assert.ok(["0.14.0", "0.45.0"].includes(metadata.version), "Unreviewed candidate version");
  return { root, version: metadata.version, require: createRequire(path.join(root, "package.json")) };
}

function child(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 4000,
    maxBuffer: 16384,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, AI1_PROXY_CANDIDATE_RESOURCES: resources },
  });
  assert.equal(result.error, undefined, "Candidate probe reaches its process deadline");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function adapterProbe() {
  const candidate = candidateRoot();
  const theiaEntry = require.resolve("@theia/plugin-ext/lib/hosted/node/plugin-host-proxy");
  const originalLoad = Module._load;
  const originalConnect = net.Socket.prototype.connect;
  const http = require("http"),
    https = require("https"),
    tls = require("tls");
  const originals = {
    http: { get: http.get, request: http.request },
    https: { get: https.get, request: https.request },
    tls: tls.createSecureContext,
  };
  const record = { version: candidate.version, phase: "setup", outboundConnections: 0 };
  try {
    net.Socket.prototype.connect = function () {
      record.outboundConnections++;
      throw new Error("Adapter API review must not connect to a network");
    };
    Module._load = function (request, parent, ...args) {
      if (parent?.filename === theiaEntry && request === "@vscode/proxy-agent")
        return candidate.require(request);
      return originalLoad.call(this, request, parent, ...args);
    };
    require(theiaEntry).connectProxyResolver(
      {
        resolveProxy: async () => {
          throw new Error("Unexpected proxy resolution");
        },
      },
      {
        getConfiguration: () => ({
          get: (key) => ({ proxySupport: "override", systemCertificates: false })[key],
        }),
        onDidChangeConfiguration: () => {},
      },
    );
    record.phase = "ready";
    assert.equal(typeof require("http").get, "function");
    assert.equal(typeof require("https").request, "function");
  } catch (error) {
    record.error = { name: error.name, message: error.message };
  } finally {
    Module._load = originalLoad;
    net.Socket.prototype.connect = originalConnect;
    Object.assign(http, originals.http);
    Object.assign(https, originals.https);
    tls.createSecureContext = originals.tls;
  }
  console.log(JSON.stringify(record));
}

if (process.argv[2] === "--adapter-probe") {
  adapterProbe();
} else {
  const candidate = candidateRoot();
  test("the unchanged Theia adapter accepts the isolated candidate API", (t) => {
    const record = child(fileURLToPath(import.meta.url), ["--adapter-probe"]);
    t.diagnostic(JSON.stringify(record));
    assert.equal(record.version, candidate.version);
    assert.equal(record.outboundConnections, 0);
    assert.equal(record.error, undefined, "The unchanged adapter cannot initialize this candidate API");
    assert.equal(record.phase, "ready");
  });
  const routes = ["agent"];
  for (const route of routes) {
    for (const type of route === "theia" ? ["HTTP", "CONNECT"] : ["HTTP", "CONNECT", "SOCKS5"]) {
      for (const cancellation of ["signal", "destroy"]) {
        test(`candidate ${candidate.version} ${route} ${type} ${cancellation} completes cleanup`, (t) => {
          const record = child(fileURLToPath(new URL("./proxy-cancellation.spec.mjs", import.meta.url)), [
            "--probe",
            type,
            cancellation,
            route,
          ]);
          t.diagnostic(JSON.stringify(record));
          assert.equal(record.dependencySelection, "isolated-candidate");
          assert.equal(record.versions["@vscode/proxy-agent"], candidate.version);
          assert.equal(record.agentMethod, candidate.version === "0.14.0" ? "callback" : "connect");
          assert.equal(record.hostResolverCalls, 0);
          assert.deepEqual(
            record.configurationReads,
            route === "theia" ? ["proxySupport", "systemCertificates", "proxy"] : [],
          );
          assert.deepEqual(record.before, {
            callbackState: type === "HTTP" ? "resolved" : "pending",
            socketEvents: type === "HTTP" ? 1 : 0,
          });
          assert.equal(record.request.destroyed, true);
          assert.equal(
            record.request.errors.length,
            1,
            "Cancellation does not settle the actual candidate request",
          );
          assert.equal(
            record.request.errors[0].code,
            cancellation === "signal" ? "ABORT_ERR" : "FIXTURE_CANCEL",
          );
          assert.equal(record.request.closed, true);
          assert.notEqual(record.callbackState, "pending");
          assert.equal(record.peerSockets, 0, "The candidate proxy peer stays open before teardown");
          assert.equal(record.clientSockets.length, 1);
          assert.equal(record.clientSockets[0].destroyed, true);
          assert.equal(record.abortListeners, 0);
        });
      }
    }
  }
}
