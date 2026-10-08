import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourceRequire = process.env.AI1_PACKAGED_RESOURCES
  ? createRequire(path.resolve(process.env.AI1_PACKAGED_RESOURCES, "package.json"))
  : require;

// Execute only selected method text. Do not load Electron, native modules, or service constructors.
function methods(module, className, names, context = {}) {
  const file = sourceRequire.resolve(module);
  const source = fs.readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0);
  const classes = [];
  const visit = (node) => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name?.text === className)
      classes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(classes.length, 1, "The reviewed source class changes");
  const selected = names.map((name) => {
    const matches = classes[0].members.filter(
      (member) => ts.isMethodDeclaration(member) && member.name.getText(parsed) === name,
    );
    assert.equal(matches.length, 1, "The reviewed method changes");
    return matches[0].getText(parsed);
  });
  return vm.runInNewContext(`(class { ${selected.join("\n")} })`, context, { timeout: 1000 });
}

function pending() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const logger = {
  info() {},
  debug() {},
  warn() {},
  error(error) {
    throw error;
  },
};

test("backend exit hook returns before an asynchronous contribution finishes", async () => {
  const events = [];
  const release = pending();
  const Backend = methods(
    "@theia/core/lib/node/backend-application",
    "BackendApplication",
    ["onStop", "stopContributions"],
    { process: { pid: 123 } },
  );
  const backend = new Backend();
  backend.logger = logger;
  backend.processUtils = {
    terminateProcessTree: (pid) => {
      assert.equal(pid, 123);
      events.push("tree-request");
    },
  };
  backend.contributionsProvider = {
    getContributions: () => [
      {
        onStop: async () => {
          events.push("hook-start");
          await release.promise;
          events.push("hook-finish");
        },
      },
    ],
  };
  assert.equal(backend.onStop(), undefined);
  assert.deepEqual(events, ["hook-start", "tree-request"]);
  backend.onStop();
  assert.deepEqual(events, ["hook-start", "tree-request", "tree-request"]);
  release.resolve();
  await release.promise;
  await Promise.resolve();
  assert.equal(events.at(-1), "hook-finish");
});

test("watcher disposal resolves before native unsubscribe completes", async () => {
  const disposal = Symbol("review-disposal");
  const Watcher = methods(
    "@theia/filesystem/lib/node/parcel-watcher/parcel-filesystem-service",
    "ParcelWatcher",
    ["_dispose", "stopWatcher"],
    { exports: { WatcherDisposal: disposal } },
  );
  const watcher = new Watcher();
  const release = pending();
  const events = [];
  watcher.debug = () => {};
  watcher.deferredDisposalDeferred = {
    reject: (value) => {
      assert.equal(value, disposal);
      events.push("disposal-notice");
    },
  };
  watcher.watcher = {
    unsubscribe: async () => {
      events.push("unsubscribe-start");
      await release.promise;
      events.push("unsubscribe-finish");
    },
  };
  await watcher._dispose();
  assert.equal(watcher.disposed, true);
  assert.equal(watcher.watcher, undefined);
  assert.deepEqual(events, ["disposal-notice", "unsubscribe-start"]);
  await watcher._dispose();
  assert.deepEqual(events, ["disposal-notice", "unsubscribe-start"]);
  release.resolve();
  await release.promise;
  assert.equal(events.at(-1), "unsubscribe-finish");
});

test("signal-driven graceful shutdown waits for contributions and container cleanup", async () => {
  const events = [];
  const hook = pending();
  const hookStarted = pending();
  const unbind = pending();
  const unbindStarted = pending();
  const Backend = methods(
    "@theia/core/lib/node/backend-application",
    "BackendApplication",
    ["gracefulShutdown", "stopContributions"],
    {
      SHUTDOWN_TIMEOUT_MS: 5000,
      // This order check does not test the timeout path or install real timers.
      promise_util_1: { timeoutReject: () => new Promise(() => {}) },
      process: {
        exit: (code) => {
          assert.equal(code, 1);
          events.push("exit-request");
        },
      },
    },
  );
  const backend = new Backend();
  backend.logger = logger;
  backend.contributionsProvider = {
    getContributions: () => [
      {
        onStop: async () => {
          events.push("hook-start");
          hookStarted.resolve();
          await hook.promise;
          events.push("hook-finish");
        },
      },
    ],
  };
  backend.rootContainer = {
    unbindAllAsync: async () => {
      events.push("unbind-start");
      unbindStarted.resolve();
      await unbind.promise;
      events.push("unbind-finish");
    },
  };
  const shutdown = backend.gracefulShutdown();
  await hookStarted.promise;
  assert.deepEqual(events, ["hook-start"]);
  hook.resolve();
  await unbindStarted.promise;
  assert.deepEqual(events, ["hook-start", "hook-finish", "unbind-start"]);
  unbind.resolve();
  await shutdown;
  assert.deepEqual(events, ["hook-start", "hook-finish", "unbind-start", "unbind-finish", "exit-request"]);
  await backend.gracefulShutdown();
  assert.equal(events.filter((event) => event === "exit-request").length, 1);
});

test("watcher singleton disposal does not stop an active handle", () => {
  const Service = methods(
    "@theia/filesystem/lib/node/parcel-watcher/parcel-filesystem-service",
    "ParcelFileSystemWatcherService",
    ["dispose"],
  );
  const service = new Service();
  let stops = 0;
  service.watcherHandles = new Map([
    [
      1,
      {
        _dispose: () => {
          stops++;
        },
      },
    ],
  ]);
  assert.equal(service.dispose(), undefined);
  assert.equal(stops, 0);
  assert.equal(service.watcherHandles.size, 1);
});

test("process-manager stop requests PTY termination without waiting for its exit callback", () => {
  const Manager = methods("@theia/process/lib/node/process-manager", "ProcessManager", [
    "onStop",
    "unregister",
    "getProcessLabel",
  ]);
  const Terminal = methods("@theia/process/lib/node/terminal-process", "TerminalProcess", [
    "kill",
    "onTerminalExit",
    "unregisterProcess",
  ]);
  const manager = new Manager();
  const terminal = new Terminal();
  const events = [];
  terminal.id = 1;
  terminal.killed = false;
  terminal.processManager = manager;
  terminal.terminal = {
    kill: () => {
      events.push("kill-request");
    },
  };
  terminal.emitOnExit = () => {
    terminal.killed = true;
    events.push("exit-callback");
  };
  manager.logger = logger;
  manager.processes = new Map([[terminal.id, terminal]]);
  manager.deleteEmitter = {
    fire: () => {
      events.push("unregister");
    },
  };
  assert.equal(manager.onStop(), undefined);
  assert.deepEqual(events, ["kill-request", "unregister"]);
  assert.equal(manager.processes.size, 0);
  assert.equal(terminal.killed, false);
  terminal.onTerminalExit(0, 0);
  assert.deepEqual(events, ["kill-request", "unregister", "exit-callback"]);
});
