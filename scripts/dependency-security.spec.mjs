import * as assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import * as http from "node:http";
import { once as eventOnce } from "node:events";
import { spawnSync } from "node:child_process";

const require = process.env.AI1_PACKAGED_RESOURCES
  ? createRequire(path.resolve(process.env.AI1_PACKAGED_RESOURCES, "package.json"))
  : createRequire(import.meta.url);
const uri = require("fast-uri");
const { Address4, Address6, AddressError } = require("ip-address");
const mcpAuthPath = process.env.AI1_MCP_SDK_REVIEW
  ? path.resolve(process.env.AI1_MCP_SDK_REVIEW, "dist/cjs/client/auth.js")
  : require.resolve("@modelcontextprotocol/sdk/client/auth.js");
const mcpVersion = require(path.resolve(path.dirname(mcpAuthPath), "../../../package.json")).version;
const mcpIsAffected = require("semver").satisfies(mcpVersion, ">=1.12.0 <1.31.0");
const requireSecurityFixes = process.env.AI1_REQUIRE_DEPENDENCY_FIXES === "1";
const reviewUnguardedMcp = process.env.AI1_MCP_UNGUARDED_REVIEW === "1";
const mcpProviderPath = reviewUnguardedMcp
  ? require.resolve("@theia/ai-mcp/lib/node/mcp-oauth-client-provider")
  : require.resolve("ai1-shell-layout/lib/node/guarded-mcp-oauth-client-provider");

for (const fixture of [
  { label: "configured static client", pinned: true, static: true, stamped: true },
  { label: "static client with issuer-bound tokens", static: true, stamped: true, guardRejects: true },
  { label: "stored issuer-bound client and tokens", stamped: true },
  { label: "legacy stored client and tokens", residual: true, guardRejects: true },
  { label: "static client with legacy tokens", static: true, residual: true, guardRejects: true },
  {
    label: "static authorization-code exchange without an issuer",
    static: true,
    code: true,
    residual: true,
    guardRejects: true,
  },
  { label: "same-server stored client and tokens", stamped: true, sameServer: true },
  { label: "same-server legacy client and tokens", sameServer: true, guardRejects: true },
  {
    label: "same-server static client with issuer-bound tokens",
    static: true,
    stamped: true,
    sameServer: true,
    pinned: true,
  },
  {
    label: "same-server pinned static authorization-code exchange",
    static: true,
    pinned: true,
    stamped: true,
    sameServer: true,
    code: true,
  },
  {
    label: "same-server pinned static exchange with legacy tokens",
    static: true,
    pinned: true,
    sameServer: true,
    code: true,
    guardRejects: true,
    residual: true,
  },
  { label: "same-server cached issuer-bound credentials", stamped: true, sameServer: true, cached: true },
  {
    label: "changed cached discovery with issuer-bound credentials",
    stamped: true,
    cached: true,
    guardRejects: true,
  },
  { label: "cached discovery with legacy credentials", cached: true, guardRejects: true, residual: true },
]) {
  test(
    `the Theia MCP OAuth caller keeps credentials at their issuer: ${fixture.label}`,
    {
      todo:
        reviewUnguardedMcp && !requireSecurityFixes && fixture.residual
          ? "Issuerless legacy or static credentials remain outside the package fix."
          : reviewUnguardedMcp &&
              !requireSecurityFixes &&
              mcpIsAffected &&
              !fixture.pinned &&
              !fixture.sameServer
            ? "The installed MCP SDK lacks stored-credential issuer checks."
            : false,
    },
    () => {
      // Use the real provider with a memory store and synthetic discovery responses.
      const script = `require(process.argv[1]);
       const providerModule = require(process.argv[2]);
       const MCPOAuthClientProvider = providerModule.GuardedMCPOAuthClientProvider ?? providerModule.MCPOAuthClientProvider;
       const { mcpOAuthAccount } = require(process.argv[5]);
      const { auth } = require(process.argv[3]);
      const fixture = JSON.parse(process.argv[4]);
      const diagnostics = [];
      console.debug = message => diagnostics.push(message);
      const selectedServer = fixture.sameServer ? "https://trusted.invalid/" : "https://changed.invalid/";
      const values = new Map();
      const keyStore = {
        getPassword: async (service, account) => values.get(account),
        setPassword: async (service, account, value) => { values.set(account, value); },
        deletePassword: async (service, account) => values.delete(account)
      };
      const provider = new MCPOAuthClientProvider({
        serverName: "Fixture server", credentialScope: "https://resource.invalid/mcp",
        config: { ...(fixture.static ? { clientId: "fixture-client", clientSecret: "fixture-secret" } : {}),
          ...(fixture.pinned ? { authorizationServer: "https://trusted.invalid/" } : {}) },
        callbackUrl: "http://127.0.0.1/fixture", stateValue: "fixture-state",
        keyStore, frontendDelegate: { openExternal: async () => { throw new Error("Fixture redirect blocked"); } },
        callbackService: {}, interactive: false
      });
      let metadataRequests = 0;
      const tokenRequests = [];
      const fetchFn = async (input, options = {}) => {
        const url = new URL(input);
        if (url.hostname === "resource.invalid" && url.pathname.includes(".well-known")) {
          metadataRequests++;
          return Response.json({ resource: "https://resource.invalid/mcp", authorization_servers: [selectedServer] });
        }
        if (url.origin + "/" === selectedServer && url.pathname.includes(".well-known")) {
          metadataRequests++;
          return Response.json({ issuer: selectedServer, authorization_endpoint: selectedServer + "authorize",
            token_endpoint: selectedServer + "token", response_types_supported: ["code"],
            token_endpoint_auth_methods_supported: ["client_secret_basic"] });
        }
        if (url.href === selectedServer + "token" && options.method === "POST") {
          tokenRequests.push({ url: url.href, credentials: new Headers(options.headers).get("authorization"),
            refreshToken: new URLSearchParams(options.body).get("refresh_token"),
            code: new URLSearchParams(options.body).get("code") });
          return Response.json({ access_token: "fixture-new-token", token_type: "Bearer" });
        }
        throw new Error("Unexpected fixture fetch: " + url.href);
      };
      (async () => {
         const seed = (key, value) => values.set(mcpOAuthAccount("Fixture server", "https://resource.invalid/mcp", key), JSON.stringify(value));
         if (!fixture.static) seed("client", { client_id: "fixture-client",
           ...(fixture.stamped ? { issuer: "https://trusted.invalid/" } : {}) });
         seed("tokens", { access_token: "fixture-access", refresh_token: "fixture-refresh",
           token_type: "Bearer", expires_in: 0, saved_at: Date.now(), ...(fixture.stamped ? { issuer: "https://trusted.invalid/" } : {}) });
       if (fixture.cached) {
         seed("discovery", { authorizationServerUrl: selectedServer,
           authorizationServerMetadata: { issuer: selectedServer, authorization_endpoint: selectedServer + "authorize",
             token_endpoint: selectedServer + "token", response_types_supported: ["code"], token_endpoint_auth_methods_supported: ["client_secret_basic"] },
           resourceMetadata: { resource: "https://resource.invalid/mcp", authorization_servers: [selectedServer] } });
       }
       const initial = Array.from(values);
        if (fixture.code) await provider.saveCodeVerifier("fixture-verifier");
        let error;
        let result;
        try { result = await auth(provider, { serverUrl: "https://resource.invalid/mcp", fetchFn,
          ...(fixture.code ? { authorizationCode: "fixture-code" } : {}) }); }
        catch (cause) { error = cause.message; }
          console.log(JSON.stringify({ metadataRequests, tokenRequests, error, result, diagnostics, unchanged: JSON.stringify(initial) === JSON.stringify(Array.from(values)),
          stored: Array.from(values.values()).map(value => JSON.parse(value)) }));
      })().catch(error => { console.error(error); process.exitCode = 1; });`;
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          script,
          require.resolve("reflect-metadata"),
          mcpProviderPath,
          mcpAuthPath,
          JSON.stringify(fixture),
          require.resolve("@theia/ai-mcp/lib/node/mcp-oauth-keystore"),
        ],
        { encoding: "utf8", timeout: 5000, maxBuffer: 4096 },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      if (reviewUnguardedMcp && !fixture.stamped && !mcpIsAffected && !fixture.code)
        assert.match(result.stderr, /stored OAuth tokens have no 'issuer' property/);
      else assert.equal(result.stderr, "");
      const record = JSON.parse(result.stdout);
      assert.equal(record.metadataRequests, fixture.cached ? 0 : 2);
      if (!reviewUnguardedMcp && (fixture.guardRejects || !fixture.sameServer)) {
        assert.match(record.error, /MCP OAuth credentials/);
        assert.deepEqual(record.tokenRequests, []);
        assert.equal(record.unchanged, true);
        return;
      }
      if (fixture.pinned && !fixture.sameServer)
        assert.match(record.error, /does not match configured authorization server/);
      if (fixture.sameServer) {
        assert.equal(record.result, "AUTHORIZED");
        assert.deepEqual(record.tokenRequests, [
          {
            url: "https://trusted.invalid/token",
            credentials: fixture.static ? "Basic Zml4dHVyZS1jbGllbnQ6Zml4dHVyZS1zZWNyZXQ=" : null,
            refreshToken: fixture.code ? null : "fixture-refresh",
            code: fixture.code ? "fixture-code" : null,
          },
        ]);
        if (!mcpIsAffected) {
          const tokens = record.stored.find((value) => value.access_token === "fixture-new-token");
          assert.equal(tokens.issuer, "https://trusted.invalid/");
          if (!fixture.static) {
            const client = record.stored.find((value) => value.client_id === "fixture-client");
            assert.equal(client.issuer, "https://trusted.invalid/");
          }
        }
      } else assert.deepEqual(record.tokenRequests, []);
    },
  );
}

test(
  "the development formatter reproduces out-of-range precision without unbounded output",
  { skip: Boolean(process.env.AI1_PACKAGED_RESOURCES) },
  () => {
    const script = `const { sprintf } = require(process.argv[1]);
    for (const type of ["f", "e", "g"]) {
      try { sprintf("%.101" + type, 1.25); console.log("accepted"); }
      catch (error) { console.log(error.name); }
    }
    console.log(sprintf("%.2f", 1.25));`;
    const result = spawnSync(process.execPath, ["-e", script, require.resolve("sprintf-js")], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4096,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(result.stdout.trim().split("\n"), ["RangeError", "RangeError", "RangeError", "1.25"]);
  },
);

test("proxy trust rejects IPv4 clients outside mapped IPv6 trust subnets", () => {
  const proxy = require("proxy-addr");
  const request = {
    socket: { remoteAddress: "203.0.113.15" },
    headers: { "x-forwarded-for": "198.51.100.77" },
  };
  for (const subnet of ["::ffff:10.0.0.0/8", "::/1", "::ffff:10.0.0.0/104", "10.0.0.0/8"])
    assert.equal(proxy(request, subnet), request.socket.remoteAddress, subnet);
  assert.equal(
    proxy({ ...request, socket: { remoteAddress: "10.2.3.4" } }, "::ffff:10.0.0.0/104"),
    "198.51.100.77",
  );
});

test(
  "the downloader proxy controller logs hostile precision text as context, not as a format",
  { skip: Boolean(process.env.AI1_PACKAGED_RESOURCES) },
  () => {
    const script = `process.env.ROARR_LOG = "true";
    require(process.argv[1]);
    global.ROARR.write = () => {};
    const formatter = require(process.argv[2]);
    const sprintf = formatter.sprintf;
    const formats = [];
    formatter.sprintf = (format, ...args) => { formats.push(format); return sprintf(format, ...args); };
    const createController = require(process.argv[3]).default;
    const controller = createController();
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]) controller[key] = "%.101f";
    console.log(JSON.stringify({ formats, values: Object.values(controller) }));`;
    const caller = createRequire(require.resolve("global-agent"));
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        script,
        caller.resolve("roarr"),
        caller.resolve("sprintf-js"),
        caller.resolve("./factories/createProxyController"),
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 4096 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      formats: ["configuration changed", "configuration changed", "configuration changed"],
      values: ["%.101f", "%.101f", "%.101f"],
    });
  },
);

test(
  "the Mocha diff reporter uses generation APIs, not affected patch input APIs",
  { skip: Boolean(process.env.AI1_PACKAGED_RESOURCES) },
  () => {
    const script = `const { createRequire } = require("node:module");
    const caller = createRequire(process.argv[1]);
    const diff = caller("diff");
    const observed = { ...diff };
    const calls = [];
    for (const name of ["parsePatch", "applyPatch"]) observed[name] = () => { throw new Error("Unexpected patch input API"); };
    for (const name of ["createPatch", "diffWordsWithSpace"]) {
      const original = diff[name];
      observed[name] = (...args) => { calls.push(name); return original(...args); };
    }
    require.cache[caller.resolve("diff")].exports = observed;
    const reporter = require(process.argv[1]);
    reporter.useColors = false;
    for (const inline of [false, true]) {
      reporter.inlineDiffs = inline;
      const output = reporter.generateDiff("Fixture actual", "Fixture expected");
      if (!output.includes("actual") || !output.includes("expected") || output.includes("failed to generate")) throw new Error("Fixture diff fails");
    }
    console.log(JSON.stringify(calls));`;
    const result = spawnSync(process.execPath, ["-e", script, require.resolve("mocha/lib/reporters/base")], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4096,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), ["createPatch", "diffWordsWithSpace"]);
  },
);

test(
  "the development logger reaches the formatter precision defect only through format calls",
  { skip: Boolean(process.env.AI1_PACKAGED_RESOURCES) },
  () => {
    const script = `const path = require("node:path");
    const roarrPath = process.argv[1];
    require(roarrPath);
    const createLogger = require(path.join(path.dirname(roarrPath), "factories/createLogger.js")).default;
    let delivered = 0;
    const log = createLogger(() => delivered++);
    for (const type of ["f", "e", "g"]) {
      try { log("%.101" + type, 1.25); console.log("accepted"); }
      catch (error) { console.log(error.name); }
    }
    log("%.2f", 1.25);
    log("%.101f");
    console.log("delivered:" + delivered);`;
    const result = spawnSync(process.execPath, ["-e", script, require.resolve("roarr")], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4096,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "RangeError",
      "RangeError",
      "RangeError",
      "delivered:2",
    ]);
  },
);

test("Express request IP rejects forged forwarding under cross-family proxy trust", () => {
  const express = require("express");
  const app = express();
  const request = Object.create(express.request);
  request.app = app;
  request.socket = { remoteAddress: "203.0.113.15" };
  request.headers = { "x-forwarded-for": "198.51.100.77" };
  assert.equal(app.get("trust proxy"), false);
  assert.equal(request.ip, request.socket.remoteAddress);
  for (const subnet of ["::ffff:10.0.0.0/8", "::/1", "::ffff:10.0.0.0/104", "10.0.0.0/8"]) {
    app.set("trust proxy", subnet);
    assert.equal(request.ip, request.socket.remoteAddress, subnet);
    assert.deepEqual(request.ips, [], subnet);
  }
  app.set("trust proxy", "::ffff:10.0.0.0/104");
  request.socket = { remoteAddress: "10.2.3.4" };
  assert.equal(request.ip, "198.51.100.77");
  assert.deepEqual(request.ips, ["198.51.100.77"]);
});

test(
  "the build watcher reproduces nested-brace stack exhaustion only with globbing enabled",
  {
    skip: Boolean(process.env.AI1_PACKAGED_RESOURCES),
  },
  () => {
    const module = require.resolve("chokidar");
    const script = `const chokidar = require(process.argv[1]);
    const watcher = new chokidar.FSWatcher({ disableGlobbing: process.argv[2] === "true" });
    let outcome;
    try {
      watcher._getWatchHelpers("{".repeat(3000) + "x,y" + "}".repeat(3000), 0);
      outcome = "accepted";
    } catch (error) {
      outcome = error.name;
    } finally {
      watcher.close();
    }
    console.log(outcome);`;
    for (const disableGlobbing of [false, true]) {
      const result = spawnSync(
        process.execPath,
        ["--stack-size=256", "-e", script, module, String(disableGlobbing)],
        {
          encoding: "utf8",
          timeout: 5000,
          maxBuffer: 4096,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout.trim(), disableGlobbing ? "accepted" : "RangeError");
    }
  },
);

test(
  "the build glob task generator reproduces nested-brace stack exhaustion only with expansion enabled",
  {
    skip: Boolean(process.env.AI1_PACKAGED_RESOURCES),
  },
  () => {
    const module = require.resolve("fast-glob");
    const script = `const glob = require(process.argv[1]);
    try {
      glob.generateTasks(["{".repeat(3000) + "x,y" + "}".repeat(3000)], { braceExpansion: process.argv[2] === "true" });
      console.log("accepted");
    } catch (error) {
      console.log(error.name);
    }`;
    for (const braceExpansion of [true, false]) {
      const result = spawnSync(
        process.execPath,
        ["--stack-size=256", "-e", script, module, String(braceExpansion)],
        {
          encoding: "utf8",
          timeout: 5000,
          maxBuffer: 4096,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout.trim(), braceExpansion ? "RangeError" : "accepted");
    }
  },
);

test("the installed proxy event helper settles connect and error events and removes listeners", async () => {
  const once = require("@tootallnate/once");
  for (const event of ["connect", "error"]) {
    const emitter = new EventEmitter();
    const pending = once(emitter, "connect");
    const outcome = event === "error" ? assert.rejects(pending, /Fixture connection failure/) : pending;
    emitter.emit(event, event === "error" ? new Error("Fixture connection failure") : "connected");
    if (event === "connect") assert.equal(await outcome, "connected");
    else await outcome;
    assert.equal(emitter.listenerCount("connect"), 0);
    assert.equal(emitter.listenerCount("error"), 0);
  }
});

test("the VS Code proxy wrapper preserves a direct agent without a socket event wait", async () => {
  const createAgent = require("@vscode/proxy-agent/out/agent");
  const original = new http.Agent();
  const agent = createAgent(() => "DIRECT", { originalAgent: original });
  const request = new EventEmitter();
  request.path = "/fixture";
  const events = [];
  request.on("proxy", (event) => events.push(event));
  try {
    const result = await agent.callback(request, {
      host: "example.invalid",
      port: 80,
      secureEndpoint: false,
    });
    assert.equal(result, original);
    assert.equal(events.length, 1);
    assert.equal(events[0].proxy, "DIRECT");
    assert.equal(events[0].socket, original);
  } finally {
    agent.destroy();
    original.destroy();
  }
});

for (const type of ["CONNECT", "SOCKS5"]) {
  test(`the VS Code ${type} proxy caller reports a loopback proxy refusal`, () => {
    // The proxy rejects the handshake before any target connection or TLS exchange.
    const script = `const http = require("node:http");
    const https = require("node:https");
    const net = require("node:net");
    const createAgent = require(process.argv[1]);
    const connect = process.argv[2] === "CONNECT";
    let handshakes = 0;
    const sockets = new Set();
    const server = connect ? http.createServer() : net.createServer(socket => {
      socket.once("data", data => {
        if (data[0] !== 5) throw new Error("Unexpected SOCKS version");
        handshakes++;
        socket.end(Buffer.from([5, 255]));
      });
    });
    server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    if (connect) server.on("connect", (request, socket) => {
      if (request.url !== "example.invalid:443") throw new Error("Unexpected CONNECT target");
      handshakes++;
      socket.end("HTTP/1.1 403 Forbidden\\r\\nContent-Length: 0\\r\\nConnection: close\\r\\n\\r\\n");
    });
    server.listen(0, "127.0.0.1", async () => {
      const agent = createAgent(() => (connect ? "PROXY " : "SOCKS5 ") + "127.0.0.1:" + server.address().port);
      try {
        const outcome = await new Promise((resolve, reject) => {
          const client = connect ? https : http;
          const outgoing = client.get((connect ? "https" : "http") + "://example.invalid/fixture", { agent }, response => {
            response.resume();
            response.on("end", () => resolve({ status: response.statusCode }));
            response.on("error", reject);
          });
          outgoing.setTimeout(3000, () => outgoing.destroy(new Error("Fixture timeout")));
          outgoing.on("error", error => resolve({ error: error.message }));
        });
        console.log(JSON.stringify({ handshakes, outcome }));
      } catch (error) { console.error(error); process.exitCode = 1; }
      finally { agent.destroy(); for (const socket of sockets) socket.destroy(); server.close(); }
    });`;
    const result = spawnSync(
      process.execPath,
      ["-e", script, require.resolve("@vscode/proxy-agent/out/agent"), type],
      { encoding: "utf8", timeout: 8000, maxBuffer: 4096 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const record = JSON.parse(result.stdout);
    assert.equal(record.handshakes, 1);
    if (type === "CONNECT") assert.deepEqual(record.outcome, { status: 403 });
    else assert.match(record.outcome.error, /Failed to establish a socket connection/);
  });
}

test("the core dynamic loader can reach the copied MCP SDK outside the bundle graph", () => {
  const { dynamicRequire } = require("@theia/core/lib/node/dynamic-require");
  assert.throws(() => dynamicRequire("./fixture"), /cannot be a relative path/);
  const authPath = require.resolve("@modelcontextprotocol/sdk/client/auth.js");
  assert.equal(dynamicRequire(authPath).auth, require(authPath).auth);
});

test("the VS Code HTTP proxy caller connects to a loopback fixture and reports connection failure", async () => {
  const createAgent = require("@vscode/proxy-agent/out/agent");
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "http://example.invalid/fixture");
    response.end("Fixture response");
  });
  server.listen(0, "127.0.0.1");
  await eventOnce(server, "listening");
  const { port } = server.address();
  const agent = createAgent(() => `PROXY 127.0.0.1:${port}`);
  const request = () =>
    new Promise((resolve, reject) => {
      const outgoing = http.get("http://example.invalid/fixture", { agent }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
        response.on("error", reject);
      });
      outgoing.setTimeout(5000, () => outgoing.destroy(new Error("Fixture request timeout")));
      outgoing.on("error", reject);
    });
  try {
    assert.equal(await request(), "Fixture response");
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await assert.rejects(request(), /Failed to establish a socket connection/);
  } finally {
    agent.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test("the core UUID caller hashes without a caller-provided buffer", () => {
  const core = createRequire(require.resolve("@theia/core/package.json"));
  const { v5 } = core("uuid");
  const namespace = "4c90ee4f-d952-44b1-83ca-f04121ab8e05";
  const result = v5("fixture", namespace);
  assert.match(result, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(v5("fixture", namespace), result);
});

test("tooltip and trash UUID dependencies support their reviewed v4 caller", () => {
  for (const name of ["react-tooltip", "trash"]) {
    const caller = createRequire(require.resolve(`${name}/package.json`));
    const { v4 } = caller("uuid");
    assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("the actual Theia UUID utility uses no output buffer or offset", () => {
  const core = createRequire(require.resolve("@theia/core/package.json"));
  const script = `const assert = require("node:assert/strict");
    const uuidPath = process.argv[2];
    const uuid = require(uuidPath);
    const calls = [];
    require.cache[uuidPath].exports = {
      ...uuid,
      v4(...args) { assert.equal(args.length, 0); calls.push("v4"); return uuid.v4(...args); },
      v5(...args) {
        assert.equal(args.length, 2);
        assert.equal(typeof args[0], "string");
        assert.equal(args[1], "4c90ee4f-d952-44b1-83ca-f04121ab8e05");
        calls.push("v5");
        return uuid.v5(...args);
      }
    };
    const utility = require(process.argv[1]);
    for (const value of ["", "fixture", "Unicode fixture \\u03b1\\ud83d\\ude80"]) {
      const expected = uuid.v5(value, "4c90ee4f-d952-44b1-83ca-f04121ab8e05");
      assert.equal(utility.hashValue(value), expected);
      assert.equal(utility.hashValue(value), expected);
      assert.equal(utility.isUUID(expected), true);
    }
    const first = utility.generateUuid();
    const second = utility.generateUuid();
    assert.equal(utility.isUUID(first), true);
    assert.notEqual(first, second);
    assert.deepEqual(calls, ["v5", "v5", "v5", "v5", "v5", "v5", "v4", "v4"]);
    console.log(JSON.stringify({ hashCalls: 6, randomCalls: 2, outputBuffers: 0 }));`;
  const result = spawnSync(
    process.execPath,
    ["-e", script, core.resolve("./lib/common/uuid"), core.resolve("uuid")],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { hashCalls: 6, randomCalls: 2, outputBuffers: 0 });
});

for (const format of ["CommonJS", "ESM"]) {
  test(`the actual ${format} tooltip constructor uses UUID v4 without buffer arguments`, () => {
    const caller = createRequire(require.resolve("react-tooltip/package.json"));
    const entry =
      format === "CommonJS"
        ? caller.resolve("react-tooltip")
        : path.join(path.dirname(caller.resolve("react-tooltip/package.json")), "dist/index.es.js");
    const script = `const assert = require("node:assert/strict");
      const Module = require("node:module");
      const entry = process.argv[1];
      const uuidPath = process.argv[2];
      const uuid = require(uuidPath);
      const calls = [];
      require.cache[uuidPath].exports = {
        ...uuid,
        v4(...args) {
          calls.push(args.length);
          assert.equal(args.length, 0);
          return uuid.v4(...args);
        },
        v3() { throw new Error("Unexpected UUID v3 caller"); },
        v5() { throw new Error("Unexpected UUID v5 caller"); }
      };
      let exported;
      if (process.argv[3] === "ESM") {
        const result = require(process.argv[4]).buildSync({
          entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs",
          external: ["react", "prop-types", "uuid"], logLevel: "silent"
        });
        const fixture = new Module(entry, module);
        fixture.filename = entry;
        fixture.paths = Module._nodeModulePaths(require("node:path").dirname(entry));
        fixture._compile(result.outputFiles[0].text, entry);
        exported = fixture.exports;
      } else exported = require(entry);
      const Tooltip = exported.default ?? exported;
      const first = new Tooltip({});
      const second = new Tooltip({});
      const pattern = /^t[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      assert.match(first.state.uuid, pattern);
      assert.match(second.state.uuid, pattern);
      assert.notEqual(first.state.uuid, second.state.uuid);
      const supplied = new Tooltip({ uuid: "fixture-owner-id" });
      assert.equal(supplied.state.uuid, "fixture-owner-id");
      assert.deepEqual(calls, [0, 0]);
      console.log(JSON.stringify({ calls, generatedIds: 2, suppliedIdPreserved: true }));`;
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        script,
        entry,
        caller.resolve("uuid"),
        format,
        createRequire(import.meta.url).resolve("esbuild"),
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      calls: [0, 0],
      generatedIds: 2,
      suppliedIdPreserved: true,
    });
  });
}

test("the actual Linux Trash caller uses UUID v4 with memory-only filesystem operations", () => {
  const caller = createRequire(require.resolve("trash/package.json"));
  const entry = path.join(path.dirname(caller.resolve("trash/package.json")), "lib/linux.js");
  const script = `const assert = require("node:assert/strict");
    const Module = require("node:module");
    const entry = process.argv[1];
    const uuid = require(process.argv[2]);
    const calls = [], writes = [], moves = [], directories = [];
    const stubs = {
      fs: {
        lstat(file, callback) {
          assert.equal(file, "/fixture/source file.txt");
          callback(null, { dev: 17 });
        },
        writeFile(file, contents, callback) { writes.push({ file, contents }); callback(null); }
      },
      os: { cpus: () => [{}] },
      uuid: {
        ...uuid,
        v4(...args) { calls.push(args.length); assert.equal(args.length, 0); return uuid.v4(...args); },
        v3() { throw new Error("Unexpected UUID v3 caller"); },
        v5() { throw new Error("Unexpected UUID v5 caller"); }
      },
      "xdg-trashdir": async mount => { assert.equal(mount, "/fixture/mount"); return "/fixture/trash"; },
      "make-dir": async (folder, options) => { directories.push(folder); assert.equal(options.mode, 0o700); },
      "move-file": async (source, target) => { moves.push({ source, target }); },
      "@stroncium/procfs": { procfs: { processMountinfo: () => [{ devId: 17, mountPoint: "/fixture/mount" }] } }
    };
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === entry) {
        if (Object.hasOwn(stubs, request)) return stubs[request];
        if (!["util", "path", "p-map"].includes(request)) throw new Error("Unreviewed Linux Trash dependency");
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    let trash;
    try { trash = require(entry); } finally { Module._load = originalLoad; }
    trash(["/fixture/source file.txt"]).then(results => {
      assert.deepEqual(calls, [0]);
      assert.equal(results.length, 1);
      const id = require("node:path").basename(results[0].path);
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.deepEqual(moves, [{ source: "/fixture/source file.txt", target: "/fixture/trash/files/" + id }]);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].file, "/fixture/trash/info/" + id + ".trashinfo");
      assert.match(writes[0].contents, /Path=\\/fixture\\/source%20file.txt/);
      assert.deepEqual(directories, ["/fixture/trash/files", "/fixture/trash/info"]);
      assert.equal(results[0].info, writes[0].file);
      console.log(JSON.stringify({ calls, writes: writes.length, moves: moves.length }));
    }).catch(error => { console.error(error); process.exitCode = 1; });`;
  const result = spawnSync(process.execPath, ["-e", script, entry, caller.resolve("uuid")], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { calls: [0], writes: 1, moves: 1 });
});

for (const [label, module] of [
  ["shared cache wrapper", "cacheable-request"],
  ["downloader stream", "got"],
]) {
  test(
    `the ${label} revalidates cookie responses despite max-stale`,
    {
      skip: Boolean(process.env.AI1_PACKAGED_RESOURCES),
      todo:
        !requireSecurityFixes &&
        createRequire(import.meta.url)("http-cache-semantics/package.json").version === "4.2.0"
          ? "The npm release-age guard blocks the 4.3.0 update."
          : false,
    },
    () => {
      const script = `const http = require("node:http");
    const library = require(process.argv[1]);
    const useStream = process.argv[2] === "true";
    let stored;
    const ready = new Promise(resolve => stored = resolve);
    class Store extends Map {
      set(key, value) { super.set(key, value); stored(); return this; }
    }
    let requests = 0;
    const server = http.createServer((request, response) => {
      requests++;
      response.setHeader("Set-Cookie", "fixture=value");
      response.setHeader("Cache-Control", "max-age=600");
      response.end("Fixture response " + requests);
    });
    server.listen(0, "127.0.0.1", async () => {
      const store = new Store();
      const wrapper = useStream ? null : new library(http.request, store);
      const options = { protocol: "http:", hostname: "127.0.0.1", port: server.address().port, path: "/fixture", shared: true };
      const request = (headers = {}) => new Promise((resolve, reject) => {
        if (useStream) {
          const url = "http://127.0.0.1:" + options.port + "/fixture";
          const stream = library.stream(url, { cache: store, cacheOptions: { shared: true }, headers, retry: { limit: 0 }, timeout: { request: 3000 } });
          let body = "";
          let fromCache;
          stream.setEncoding("utf8");
          stream.on("response", response => fromCache = response.isFromCache);
          stream.on("data", chunk => body += chunk);
          stream.on("end", () => resolve({ body, fromCache }));
          stream.on("error", reject);
          return;
        }
        const events = wrapper({ ...options, headers }, response => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", chunk => body += chunk);
          response.on("end", () => resolve({ body, fromCache: response.fromCache }));
          response.on("error", reject);
        });
        events.on("request", outgoing => outgoing.end());
        events.on("error", reject);
      });
      try {
        const first = await request();
        await ready;
        const second = await request({ "cache-control": "max-stale=999999" });
        console.log(JSON.stringify({ first, second, originRequests: requests }));
      } catch (error) {
        console.log(JSON.stringify({ error: error.name }));
        process.exitCode = 1;
      } finally {
        server.close();
      }
    });`;
      const result = spawnSync(
        process.execPath,
        ["-e", script, require.resolve(module), String(module === "got")],
        {
          encoding: "utf8",
          timeout: 8000,
          maxBuffer: 4096,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      const record = JSON.parse(result.stdout);
      assert.deepEqual(record.first, { body: "Fixture response 1", fromCache: false });
      assert.equal(record.originRequests, 2);
      assert.deepEqual(record.second, { body: "Fixture response 2", fromCache: false });
    },
  );
}

test(
  "shared caches reject max-stale requests for security-zeroed cookie responses",
  {
    skip: Boolean(process.env.AI1_PACKAGED_RESOURCES),
    todo:
      !requireSecurityFixes &&
      createRequire(import.meta.url)("http-cache-semantics/package.json").version === "4.2.0"
        ? "The npm release-age guard blocks the 4.3.0 update."
        : false,
  },
  () => {
    const CachePolicy = createRequire(import.meta.url)("http-cache-semantics");
    const request = {
      url: "https://example.invalid/resource",
      method: "GET",
      headers: { host: "example.invalid" },
    };
    const policy = new CachePolicy(request, {
      status: 200,
      headers: { "set-cookie": "fixture=value", "cache-control": "max-age=600" },
    });
    assert.equal(policy.maxAge(), 0);
    assert.equal(
      policy.satisfiesWithoutRevalidation({
        ...request,
        headers: { ...request.headers, "cache-control": "max-stale=999999" },
      }),
      false,
    );
    const publicPolicy = new CachePolicy(request, {
      status: 200,
      headers: { "cache-control": "public, max-age=600" },
    });
    assert.equal(publicPolicy.satisfiesWithoutRevalidation(request), true);
  },
);

test("URI host normalization folds percent-encoded uppercase characters", () => {
  assert.equal(uri.parse("//%41.com").host, "a.com");
  assert.equal(uri.equal("//%41.com", "//a.com"), true);
  assert.equal(uri.normalize("//%41.com"), uri.normalize("//a.com"));
  assert.equal(uri.parse("https://example.com/path").host, "example.com");
});

test("subnet checks reject addresses from a different family", () => {
  const v4 = new Address4("10.0.0.0/8");
  const v6 = new Address6("2001:db8::/32");
  assert.equal(new Address6("a00::1").isInSubnet(v4), false);
  assert.equal(new Address4("32.1.13.184").isInSubnet(v6), false);
  assert.equal(new Address6("a00::1").isHostInSubnet(v4), false);
  assert.equal(new Address4("32.1.13.184").isHostInSubnet(v6), false);
  assert.equal(new Address4("10.0.0.1").isInSubnet(v4), true);
  assert.equal(new Address6("2001:db8::1").isInSubnet(v6), true);
});

test("IPv6 parsing rejects long input without an input-sized diagnostic", () => {
  const input = "!".repeat(4096);
  assert.throws(
    () => new Address6(input),
    (error) => {
      assert.ok(error instanceof AddressError);
      assert.equal(typeof error.parseMessage, "undefined");
      assert.ok(error.message.length < 200);
      return true;
    },
  );
  assert.equal(Address6.isValid(input), false);
  assert.equal(Address6.isValid("::1"), true);
});
