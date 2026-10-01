import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./setup-linux.sh", import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-linux-setup-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "bin"));
  fs.copyFileSync(script, path.join(root, "scripts/setup-linux.sh"));
  fs.writeFileSync(
    path.join(root, "scripts/package-linux.sh"),
    'printf "package %s\\n" "$1" >> "$SETUP_TEST_LOG"\nif [ "$SETUP_TEST_FAIL_CHECK" = "1" ]; then exit 1; fi\n',
  );
  fs.writeFileSync(
    path.join(root, "bin/npm"),
    '#!/usr/bin/env bash\nprintf "npm %s\\n" "$*" >> "$SETUP_TEST_LOG"\nif [ "$*" = "$SETUP_TEST_FAIL_NPM" ]; then exit 1; fi\n',
    { mode: 0o755 },
  );
  const log = path.join(root, "calls");
  return {
    root,
    calls: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []),
    run: (args, env = {}) =>
      spawnSync("bash", [path.join(root, "scripts/setup-linux.sh"), ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}/bin${path.delimiter}${process.env.PATH}`,
          SETUP_TEST_LOG: log,
          SETUP_TEST_FAIL_CHECK: "",
          SETUP_TEST_FAIL_NPM: "",
          ...env,
        },
      }),
  };
}

test("the default mode checks only and does not install dependencies", (t) => {
  const f = fixture(t);
  assert.equal(f.run([]).status, 0);
  assert.deepEqual(f.calls(), ["package --check"]);
});

test("invalid or extra arguments stop before any action", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--install"]).status, 1);
  assert.equal(f.run(["--build", "--force"]).status, 1);
  assert.deepEqual(f.calls(), []);
});

test("a failed prerequisite check prevents dependency installation", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--build"], { SETUP_TEST_FAIL_CHECK: "1" }).status, 1);
  assert.deepEqual(f.calls(), ["package --check"]);
});

test("an existing dependency directory remains untouched", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "node_modules"));
  const marker = path.join(f.root, "node_modules/owner-file");
  fs.writeFileSync(marker, "keep");
  assert.equal(f.run(["--build"]).status, 1);
  assert.equal(fs.readFileSync(marker, "utf8"), "keep");
  assert.deepEqual(f.calls(), ["package --check"]);
});

test("a build uses locked dependencies and checks code before packaging", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--build"]).status, 0);
  assert.deepEqual(f.calls(), [
    "package --check",
    "npm ci",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "package --dir",
  ]);
});

test("a failed code check stops the build", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--build"], { SETUP_TEST_FAIL_NPM: "run lint" }).status, 1);
  assert.deepEqual(f.calls(), ["package --check", "npm ci", "npm run lint"]);
});
