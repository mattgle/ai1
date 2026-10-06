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

for (const [label, module] of [
  ["shared cache wrapper", "cacheable-request"],
  ["downloader stream", "got"],
]) {
  test(
    `the ${label} revalidates cookie responses despite max-stale`,
    {
      skip: Boolean(process.env.AI1_PACKAGED_RESOURCES),
      todo:
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
