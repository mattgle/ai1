import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { EventEmitter, getEventListeners, once } from "node:events";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import { createRequire, Module } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const require = process.env.AI1_PACKAGED_RESOURCES
  ? createRequire(path.resolve(process.env.AI1_PACKAGED_RESOURCES, "package.json"))
  : createRequire(import.meta.url);
const entry = require.resolve("@vscode/proxy-agent/out/agent");
const caller = createRequire(entry);

async function probe(type, cancellation, route = "agent") {
  const helperPath = caller.resolve("@tootallnate/once");
  const helper = require(helperPath);
  const helperCalls = [];
  require.cache[helperPath].exports = (...args) => {
    const record = { event: args[1], arguments: args.length, state: "pending" };
    helperCalls.push(record);
    const pending = helper(...args);
    pending.then(
      () => {
        record.state = "resolved";
      },
      () => {
        record.state = "rejected";
      },
    );
    return pending;
  };
  const createAgent = require(entry);
  const peers = new Set();
  const clients = [];
  const server = net.createServer((socket) => {
    peers.add(socket);
    socket.on("close", () => peers.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const originalConnect = net.Socket.prototype.connect;
  // Observe real outbound sockets and reject any non-loopback connection.
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    assert.equal(options.host, "127.0.0.1");
    assert.equal(Number(options.port), port);
    clients.push(this);
    return originalConnect.apply(this, args);
  };
  let agent;
  let callbackState = "pending";
  const observeAgent = (...args) => {
    agent = createAgent(...args);
    const originalCallback = agent.callback;
    agent.callback = function (...values) {
      const pending = originalCallback.apply(this, values);
      pending.then(
        () => {
          callbackState = "resolved";
        },
        () => {
          callbackState = "rejected";
        },
      );
      return pending;
    };
    return agent;
  };
  const configurationReads = [];
  const telemetryTimers = [];
  const originalSetTimeout = globalThis.setTimeout;
  let hostResolverCalls = 0;
  const originalLoad = Module._load;
  const originalHttp = { get: require("http").get, request: require("http").request };
  const originalHttps = { get: require("https").get, request: require("https").request };
  const tls = require("tls");
  const originalTlsContext = tls.createSecureContext;
  if (route === "theia") {
    assert.notEqual(type, "SOCKS5", "The actual Electron host resolver does not provide SOCKS results");
    const theiaEntry = require.resolve("@theia/plugin-ext/lib/hosted/node/plugin-host-proxy");
    const theiaProxy = createRequire(theiaEntry).resolve("@vscode/proxy-agent");
    assert.equal(createRequire(theiaProxy).resolve("./agent"), entry);
    // Observe factory and callback completion without changing their arguments or results.
    require.cache[entry].exports = Object.assign(observeAgent, createAgent);
    globalThis.setTimeout = function (callback, milliseconds, ...args) {
      const timer = originalSetTimeout(callback, milliseconds, ...args);
      if (callback.name === "logEvent" && milliseconds === 600_000) telemetryTimers.push(timer);
      return timer;
    };
    let configurationChanged;
    require(theiaEntry).connectProxyResolver(
      {
        resolveProxy: async () => {
          hostResolverCalls++;
          throw new Error("Unexpected host proxy lookup");
        },
      },
      {
        getConfiguration: (section) => {
          assert.equal(section, "http");
          return {
            get: (key) => {
              configurationReads.push(key);
              return {
                proxy: `http://127.0.0.1:${port}`,
                proxySupport: "override",
                systemCertificates: false,
              }[key];
            },
          };
        },
        onDidChangeConfiguration: (listener) => {
          configurationChanged = listener;
        },
      },
    );
    assert.equal(typeof configurationChanged, "function");
    configurationChanged();
  } else {
    observeAgent(() => `${type === "SOCKS5" ? "SOCKS5" : "PROXY"} 127.0.0.1:${port}`);
  }
  const controller = new globalThis.AbortController();
  const errors = [];
  let closed = false;
  let socketEvents = 0;
  let handshake;
  const ready = new Promise((resolve, reject) => {
    server.on("connection", (socket) => {
      let bytes = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        bytes = Buffer.concat([bytes, chunk]);
        if (handshake) return;
        if (type === "SOCKS5") {
          if (bytes.length < 2 || bytes.length < 2 + bytes[1]) return;
          if (bytes[0] !== 5) return reject(new Error("Fixture receives an invalid SOCKS greeting"));
          handshake = "SOCKS5 greeting";
        } else {
          if (!bytes.includes("\r\n\r\n")) return;
          const firstLine = bytes.toString("ascii").split("\r\n")[0];
          const expected =
            type === "CONNECT"
              ? "CONNECT example.invalid:443 HTTP/1.1"
              : "GET http://example.invalid/fixture HTTP/1.1";
          if (firstLine !== expected) return reject(new Error(`Unexpected fixture request: ${firstLine}`));
          handshake = firstLine;
        }
        resolve();
      });
    });
  });
  const client =
    route === "theia" ? require(type === "CONNECT" ? "https" : "http") : type === "CONNECT" ? https : http;
  const request = client.get(`${type === "CONNECT" ? "https" : "http"}://example.invalid/fixture`, {
    ...(route === "agent" ? { agent } : {}),
    ...(cancellation === "signal" ? { signal: controller.signal } : {}),
  });
  request.on("error", (error) => errors.push({ name: error.name, code: error.code, message: error.message }));
  request.on("close", () => {
    closed = true;
  });
  request.on("socket", () => {
    socketEvents++;
  });
  try {
    // This deadline detects fixture failure. It never cancels the request.
    await Promise.race([
      ready,
      delay(1500, undefined, { ref: false }).then(() => {
        throw new Error("Fixture handshake timeout");
      }),
    ]);
    const before = { callbackState, socketEvents };
    if (cancellation === "signal") controller.abort();
    else request.destroy(Object.assign(new Error("Fixture caller cancellation"), { code: "FIXTURE_CANCEL" }));
    await delay(200);
    const record = {
      type,
      route,
      configurationReads,
      telemetryTimerCount: telemetryTimers.length,
      hostResolverCalls,
      cancellation,
      handshake,
      before,
      request: { destroyed: request.destroyed, closed, errors: [...errors], socketEvents },
      callbackState,
      peerSockets: peers.size,
      clientSockets: clients.map((socket) => ({
        destroyed: socket.destroyed,
        listeners: Object.fromEntries(
          ["connect", "data", "readable", "end", "error", "close"].map((event) => [
            event,
            socket.listenerCount(event),
          ]),
        ),
      })),
      abortListeners: getEventListeners(controller.signal, "abort").length,
      helperCalls,
      versions: Object.fromEntries(
        [
          "@vscode/proxy-agent",
          "@tootallnate/once",
          "agent-base",
          "http-proxy-agent",
          "https-proxy-agent",
          "socks-proxy-agent",
        ].map((name) => [name, caller(`${name}/package.json`).version]),
      ),
    };
    // Release the protocol wait only after recording cancellation behavior.
    for (const socket of peers) {
      socket.end(
        type === "SOCKS5"
          ? Buffer.from([5, 255])
          : "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      );
    }
    await delay(50);
    record.afterHandshakeRefusal = {
      callbackState,
      closed,
      errors: [...errors],
      peerSockets: peers.size,
      clientSockets: clients.map((socket) => ({ destroyed: socket.destroyed })),
    };
    console.log(JSON.stringify(record));
  } finally {
    // Teardown follows the evidence snapshot and cannot satisfy cleanup assertions.
    net.Socket.prototype.connect = originalConnect;
    request.destroy();
    agent.destroy();
    for (const socket of clients) socket.destroy();
    for (const socket of peers) socket.destroy();
    server.close();
    Module._load = originalLoad;
    Object.assign(require("http"), originalHttp);
    Object.assign(require("https"), originalHttps);
    tls.createSecureContext = originalTlsContext;
    globalThis.setTimeout = originalSetTimeout;
    for (const timer of telemetryTimers) globalThis.clearTimeout(timer);
  }
}

if (process.argv[2] === "--probe") {
  await probe(process.argv[3], process.argv[4], process.argv[5]);
} else {
  test("legacy Once does not support an AbortSignal options argument", async () => {
    const helper = caller("@tootallnate/once");
    const emitter = new EventEmitter();
    const controller = new globalThis.AbortController();
    const pending = helper(emitter, "connect", { signal: controller.signal });
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    controller.abort();
    await delay(10);
    assert.equal(settled, false);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(emitter.listenerCount("connect"), 1);
    assert.equal(emitter.listenerCount("error"), 1);
    emitter.emit("connect", "connected");
    assert.equal(await pending, "connected");
    assert.equal(emitter.listenerCount("connect"), 0);
    assert.equal(emitter.listenerCount("error"), 0);
  });

  test("legacy Once cancellation removes listeners but does not settle its promise", async () => {
    const helper = caller("@tootallnate/once");
    const emitter = new EventEmitter();
    const pending = helper(emitter, "connect");
    let state = "pending";
    pending.then(
      () => {
        state = "resolved";
      },
      () => {
        state = "rejected";
      },
    );
    pending.cancel();
    emitter.emit("connect");
    await delay(10);
    assert.equal(state, "pending");
    assert.equal(emitter.listenerCount("connect"), 0);
    assert.equal(emitter.listenerCount("error"), 0);
    assert.equal(helper.length, 2);
  });

  for (const route of ["agent", "theia"]) {
    for (const type of route === "theia" ? ["HTTP", "CONNECT"] : ["HTTP", "CONNECT", "SOCKS5"]) {
      for (const cancellation of ["signal", "destroy"]) {
        test(`${route === "theia" ? "Theia patched" : "VS Code"} ${type} request ${cancellation} settles and closes proxy sockets`, (t) => {
          const result = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), "--probe", type, cancellation, route],
            {
              encoding: "utf8",
              timeout: 4000,
              maxBuffer: 16384,
              env: {
                PATH: process.env.PATH,
                TMPDIR: process.env.TMPDIR,
                AI1_PACKAGED_RESOURCES: process.env.AI1_PACKAGED_RESOURCES,
              },
            },
          );
          assert.equal(result.error, undefined, "Isolated probe exceeds its process bound");
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stderr, "");
          const record = JSON.parse(result.stdout);
          t.diagnostic(JSON.stringify(record));
          assert.equal(record.route, route);
          assert.equal(record.hostResolverCalls, 0);
          assert.equal(record.telemetryTimerCount, route === "theia" ? 1 : 0);
          assert.deepEqual(
            record.configurationReads,
            route === "theia" ? ["proxySupport", "systemCertificates", "proxy"] : [],
          );
          assert.deepEqual(record.before, {
            callbackState: type === "HTTP" ? "resolved" : "pending",
            socketEvents: type === "HTTP" ? 1 : 0,
          });
          assert.deepEqual(
            record.helperCalls,
            type === "HTTP" ? [{ event: "connect", arguments: 2, state: "resolved" }] : [],
          );
          assert.equal(record.request.destroyed, true);
          assert.equal(
            record.request.errors.length,
            1,
            "Cancellation must settle the actual request, not only mark it destroyed",
          );
          assert.equal(
            record.request.errors[0].code,
            cancellation === "signal" ? "ABORT_ERR" : "FIXTURE_CANCEL",
          );
          assert.equal(record.request.closed, true);
          assert.notEqual(
            record.callbackState,
            "pending",
            "Proxy callback remains pending after request cancellation",
          );
          assert.equal(record.peerSockets, 0, "Proxy peer remains open before fixture teardown");
          assert.equal(record.clientSockets.length, 1);
          assert.equal(record.clientSockets[0].destroyed, true);
          assert.equal(record.abortListeners, 0);
        });
      }
    }
  }
}
