import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CommandRunner, PortsServiceImpl, runLsof } from "./ports-service-impl";

describe("PortsServiceImpl", () => {
  let root: string;

  beforeEach(() => {
    // `lsof` reports real paths (`/private/var/...` on macOS), so the test
    // folder is a real path too.
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-ports-")));
    fs.mkdirSync(path.join(root, "web", ".git"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runs lsof twice and groups the ports by repository", async () => {
    const calls: string[][] = [];
    const service = new PortsServiceImpl(async (_program, args) => {
      calls.push(args);
      return args.includes("cwd") ? `p42\nfcwd\nn${path.join(root, "web")}\n` : "p42\ncvite\nf20\nn*:5173\n";
    });
    const scan = await service.scan([root]);
    assert.deepStrictEqual(scan, {
      ok: true,
      groups: [
        {
          name: "web",
          path: path.join(root, "web"),
          rows: [{ pid: 42, program: "vite", port: 5173, cwd: path.join(root, "web") }],
        },
      ],
      other: [],
    });
    assert.deepStrictEqual(calls[0], ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]);
    assert.deepStrictEqual(calls[1], ["-a", "-p", "42", "-d", "cwd", "-Fn"]);
  });

  it("groups a port under the real repository path when the given root is a symlink", async () => {
    // `lsof` always reports the real path of a process's working folder. A
    // workspace root can be a symlink (for example through `/tmp`, which is
    // `/private/tmp` on macOS); the scan must resolve it to the same real
    // path before it looks for repositories under it, or the repository
    // path would never match what `lsof` reports.
    const symlinkedRoot = path.join(root, "link-to-root");
    fs.symlinkSync(root, symlinkedRoot);
    const service = new PortsServiceImpl(async (_program, args) =>
      args.includes("cwd") ? `p42\nfcwd\nn${path.join(root, "web")}\n` : "p42\ncvite\nf20\nn*:5173\n",
    );
    const scan = await service.scan([symlinkedRoot]);
    assert.deepStrictEqual(scan, {
      ok: true,
      groups: [
        {
          name: "web",
          path: path.join(root, "web"),
          rows: [{ pid: 42, program: "vite", port: 5173, cwd: path.join(root, "web") }],
        },
      ],
      other: [],
    });
  });

  it("does not run the second lsof when nothing listens", async () => {
    let count = 0;
    const service = new PortsServiceImpl(async () => {
      count++;
      return "";
    });
    assert.deepStrictEqual(await service.scan([root]), { ok: true, groups: [], other: [] });
    assert.strictEqual(count, 1);
  });

  it("gives the error text when lsof fails", async () => {
    const service = new PortsServiceImpl(async () => {
      throw new Error("lsof did not answer in 4 seconds.");
    });
    assert.deepStrictEqual(await service.scan([root]), {
      ok: false,
      error: "lsof did not answer in 4 seconds.",
    });
  });
});

describe("PortsServiceImpl.stopServer", () => {
  let root: string;
  const ownUid = process.getuid!();

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-ports-stop-")));
    fs.mkdirSync(path.join(root, "web", ".git"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Builds a fake command runner: `lsof` reports one listening process at
  // `cwd` (inside the "web" repository by default), `ps` reports `uid` as
  // its owner. Every call is recorded so a test can check no command ran.
  function fakeRun(options: { cwd?: string; uid?: number } = {}): { run: CommandRunner; calls: string[][] } {
    const cwd = options.cwd ?? path.join(root, "web");
    const uid = options.uid ?? ownUid;
    const calls: string[][] = [];
    const run: CommandRunner = async (program, args) => {
      calls.push([program, ...args]);
      if (program === "lsof" && args.includes("cwd")) {
        return `p42\nfcwd\nn${cwd}\n`;
      }
      if (program === "lsof") {
        return "p42\ncvite\nf20\nn*:5173\n";
      }
      if (program === "ps") {
        return `  ${uid}\n`;
      }
      throw new Error(`stopServer test: unexpected program "${program}"`);
    };
    return { run, calls };
  }

  it("stops a workspace process that listens on the given port and belongs to the current user", async () => {
    const { run } = fakeRun();
    const killed: [number, string][] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], 42, 5173), { ok: true });
    assert.deepStrictEqual(killed, [[42, "SIGTERM"]]);
  });

  it("refuses a process outside a workspace group", async () => {
    const { run } = fakeRun({ cwd: "/outside/anywhere" });
    const killed: unknown[] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], 42, 5173), {
      ok: false,
      error: "AI1 stops only servers of the workspace.",
    });
    assert.deepStrictEqual(killed, []);
  });

  it("refuses a pid that no longer listens on the given port", async () => {
    const { run } = fakeRun();
    const killed: unknown[] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], 42, 9999), {
      ok: false,
      error: "AI1 will not stop this process: it no longer listens on this port.",
    });
    assert.deepStrictEqual(killed, []);
  });

  it("refuses a process that belongs to another user", async () => {
    const { run } = fakeRun({ uid: ownUid + 1 });
    const killed: unknown[] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], 42, 5173), {
      ok: false,
      error: "AI1 will not stop this process: it belongs to another user.",
    });
    assert.deepStrictEqual(killed, []);
  });

  it("refuses a pid that is not a positive integer, before it runs any command", async () => {
    const { run, calls } = fakeRun();
    const killed: unknown[] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], -1, 5173), {
      ok: false,
      error: "AI1 will not stop this process: the process id is not valid.",
    });
    assert.deepStrictEqual(await service.stopServer([root], 1.5, 5173), {
      ok: false,
      error: "AI1 will not stop this process: the process id is not valid.",
    });
    assert.deepStrictEqual(calls, []);
    assert.deepStrictEqual(killed, []);
  });

  it("parses a `ps` uid with leading spaces, as macOS prints it", async () => {
    const { run } = fakeRun({ uid: ownUid });
    const killed: unknown[] = [];
    const service = new PortsServiceImpl(run, (pid, signal) => killed.push([pid, signal]));
    assert.deepStrictEqual(await service.stopServer([root], 42, 5173), { ok: true });
    assert.deepStrictEqual(killed, [[42, "SIGTERM"]]);
  });
});

describe("runLsof", () => {
  let dir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-runlsof-"));
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function fakeProgram(name: string, script: string): void {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${script}\n`);
    fs.chmodSync(path.join(dir, name), 0o755);
    process.env.PATH = `${dir}${path.delimiter}${originalPath}`;
  }

  it("gives a clear error when the program is missing", async () => {
    process.env.PATH = dir;
    await assert.rejects(runLsof("lsof", [], 1000), { message: "AI1 cannot find lsof." });
  });

  it("gives the timeout text when the program does not answer in time", async () => {
    fakeProgram("lsof", "sleep 5");
    await assert.rejects(runLsof("lsof", [], 100), { message: "lsof did not answer in 0.1 seconds." });
  });

  it("gives an empty result when the program exits with 1 and no output", async () => {
    fakeProgram("lsof", "exit 1");
    assert.strictEqual(await runLsof("lsof", [], 1000), "");
  });
});
