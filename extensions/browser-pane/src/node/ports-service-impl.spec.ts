import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PortsServiceImpl } from "./ports-service-impl";

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
