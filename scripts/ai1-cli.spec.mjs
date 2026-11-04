import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { launchWorkspace, workspaceDirectory } from "./ai1.mjs";
import { installCli } from "./install-cli.mjs";

const launcher = fileURLToPath(new URL("./ai1.mjs", import.meta.url));

function fixture(t) {
  const temporary = path.join(os.tmpdir(), "opencode");
  fs.mkdirSync(temporary, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporary, "ai1-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "App's folder/AI1.app");
  const executable = path.join(app, "Contents/MacOS/AI1");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(
    executable,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.AI1_CLI_RESULT, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),runAsNode:process.env.ELECTRON_RUN_AS_NODE}));\n`,
    { mode: 0o755 },
  );
  const cwd = path.join(root, "terminal directory");
  fs.mkdirSync(path.join(cwd, "src/app"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "folder's name $HOME"));
  fs.mkdirSync(path.join(cwd, "-folder"));
  fs.writeFileSync(path.join(cwd, "file.md"), "# Example\n");
  const output = path.join(root, "result.json");
  const env = { ...process.env, AI1_APP: app, AI1_CLI_RESULT: output, ELECTRON_RUN_AS_NODE: "1" };
  return { root, app, executable, cwd, output, env };
}

async function readResult(output) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fs.existsSync(output)) return JSON.parse(fs.readFileSync(output, "utf8"));
    await setTimeout(20);
  }
  throw new Error("The launcher did not pass the workspace to the app.");
}

test("terminal paths resolve from the caller, including spaces, links, and leading dashes", (t) => {
  const { cwd } = fixture(t);
  const real = fs.realpathSync(cwd);
  assert.equal(workspaceDirectory([], cwd), real);
  assert.equal(workspaceDirectory(["."], cwd), real);
  assert.equal(workspaceDirectory(["src/app"], cwd), path.join(real, "src/app"));
  assert.equal(workspaceDirectory([path.join(cwd, "src/app")], "/"), path.join(real, "src/app"));
  assert.equal(workspaceDirectory(["folder's name $HOME"], cwd), path.join(real, "folder's name $HOME"));
  assert.equal(workspaceDirectory(["--", "-folder"], cwd), path.join(real, "-folder"));
  fs.symlinkSync(path.join(cwd, "src/app"), path.join(cwd, "linked"));
  assert.equal(workspaceDirectory(["linked"], cwd), path.join(real, "src/app"));
});

test("invalid arguments fail before the app starts", async (t) => {
  const f = fixture(t);
  for (const args of [["missing"], ["file.md"], [".", "src/app"], ["--unknown"]]) {
    await assert.rejects(launchWorkspace(args, f));
  }
  assert.equal(fs.existsSync(f.output), false);
});

test("launcher passes one literal absolute directory and removes Electron's Node flag", async (t) => {
  const f = fixture(t);
  await launchWorkspace(["folder's name $HOME"], f);
  assert.deepEqual(await readResult(f.output), {
    args: [fs.realpathSync(path.join(f.cwd, "folder's name $HOME"))],
    cwd: fs.realpathSync(f.cwd),
  });
});

test("missing and non-executable app bundles report a launch error", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    launchWorkspace(["."], { ...f, app: path.join(f.root, "missing.app") }),
    /Cannot launch AI1/,
  );
  fs.chmodSync(f.executable, 0o644);
  await assert.rejects(launchWorkspace(["."], f), /Cannot launch AI1/);
});

test(
  "installed command works from an unrelated directory with quoted bundle and command paths",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const f = fixture(t);
    const bin = path.join(f.root, "user's bin");
    const command = installCli({ app: f.app, bin });
    const result = spawnSync(command, ["src/app"], {
      cwd: f.cwd,
      env: f.env,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readResult(f.output), {
      args: [fs.realpathSync(path.join(f.cwd, "src/app"))],
      cwd: fs.realpathSync(f.cwd),
    });
    assert.equal(installCli({ app: f.app, bin }), command);
  },
);

test("installation preserves existing commands and symbolic links", (t) => {
  const f = fixture(t);
  const bin = path.join(f.root, "bin");
  fs.mkdirSync(bin);
  const command = path.join(bin, "ai1");
  fs.writeFileSync(command, "existing command");
  assert.throws(() => installCli({ app: f.app, bin }), /already exists/);
  assert.equal(fs.readFileSync(command, "utf8"), "existing command");
  fs.unlinkSync(command);
  fs.symlinkSync("missing", command);
  assert.throws(() => installCli({ app: f.app, bin }), /already exists/);
  assert.equal(fs.readlinkSync(command), "missing");
});

test(
  "CLI help succeeds without an app and invalid directories return a nonzero status",
  { skip: process.platform !== "darwin" },
  (t) => {
    const f = fixture(t);
    const run = (args) =>
      spawnSync(process.execPath, [launcher, ...args], {
        cwd: f.cwd,
        env: f.env,
        encoding: "utf8",
        timeout: 5000,
      });
    assert.equal(run(["--help"]).status, 0);
    const result = run(["missing"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Directory does not exist/);
    assert.equal(fs.existsSync(f.output), false);
  },
);
