import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./package-mac.sh", import.meta.url));

function fixture(context, version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-mac-build-guard-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "node"), '#!/bin/sh\nprintf "v24.15.0\\n"\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, "npm"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '${version}\\n'
  exit 0
fi
printf '%s\\n' "$*" >> "$AI1_FIXTURE_CALLS"
if [ "$*" = "run build:production" ]; then exit 7; fi
`,
    { mode: 0o755 },
  );
  const calls = path.join(root, "calls.txt");
  const run = () =>
    spawnSync("bash", [script], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, AI1_FIXTURE_CALLS: calls },
    });
  return { run, calls };
}

test("macOS packaging rejects npm versions that can hide failed workspace builds", (context) => {
  const { run, calls } = fixture(context, "8.19.2");
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm 11 or later/);
  assert.equal(fs.existsSync(calls), false);
});

test("macOS packaging stops on production build failure before invoking the builder", (context) => {
  const { run, calls } = fixture(context, "12.2.0");
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 7);
  assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n"), [
    "run download:plugins",
    "run build:production",
  ]);
});
