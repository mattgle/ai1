import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./scan-secrets.mjs", import.meta.url));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-scanner-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const scanner = path.join(directory, "gitleaks");
  const log = path.join(directory, "args.jsonl");
  fs.writeFileSync(
    scanner,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SCAN_TEST_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "version") { console.log("8.30.1"); process.exit(0); }
process.exit(args[0] === process.env.SCAN_TEST_FAIL ? 1 : 0);
`,
    { mode: 0o755 },
  );
  return {
    calls: () =>
      fs
        .readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    run: (env = {}) =>
      spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: {
          ...process.env,
          TMPDIR: directory,
          GITLEAKS_BIN: scanner,
          SCAN_TEST_LOG: log,
          SCAN_TEST_FAIL: "",
          ...env,
        },
      }),
  };
}

test("both scan modes use full redaction and the reviewed config", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["version", "git", "dir"],
  );
  for (const args of calls.slice(1)) {
    assert.ok(args.includes("--redact=100"));
    assert.ok(args.includes("--config"));
    assert.ok(args.includes("--report-format=json"));
  }
  assert.ok(calls[1].includes("--log-opts=--all"));
});

test("a finding fails the command without skipping the other scan", (t) => {
  const f = fixture(t);
  assert.equal(f.run({ SCAN_TEST_FAIL: "git" }).status, 1);
  assert.deepEqual(
    f.calls().map((args) => args[0]),
    ["version", "git", "dir"],
  );
});

test("a missing scanner fails without installing a tool", (t) => {
  const f = fixture(t);
  const result = f.run({ GITLEAKS_BIN: "/missing/ai1-test-gitleaks" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No tools are installed/);
});
