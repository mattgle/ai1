import * as assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { checkLinuxMode, checkLinuxTarget } from "./linux-build-check.mjs";

const linux = {
  platform: "linux",
  arch: "x64",
  nodeVersion: "24.1.0",
  uid: 1001,
  root: "/home/test/code/ai1",
  nodePath: "/home/test/.nvm/bin/node",
  npmPath: "/home/test/.nvm/bin/npm",
};

test("accepts the initial Linux build target without claiming WSL support", () => {
  assert.equal(checkLinuxTarget(linux), undefined);
  assert.equal(checkLinuxMode("--check"), undefined);
  assert.equal(checkLinuxMode("--dir"), undefined);
});

test("rejects other platforms, architecture, root, and Node versions", () => {
  for (const change of [
    { platform: "darwin" },
    { platform: "win32" },
    { arch: "arm64" },
    { uid: 0 },
    { uid: undefined },
    { uid: -1 },
    { uid: NaN },
    { uid: 0.5 },
    { nodeVersion: "22.0.0" },
    { nodeVersion: "25.0.0" },
    { nodeVersion: "bad" },
    { nodeVersion: "24.bad" },
    { nodeVersion: undefined },
  ]) {
    assert.ok(checkLinuxTarget({ ...linux, ...change }));
  }
});

test("rejects missing paths and Windows tools without rejecting all mounts", () => {
  for (const field of ["root", "nodePath", "npmPath"]) {
    for (const value of [
      undefined,
      "",
      "relative",
      "/mnt/c/nvm4w/nodejs/npm",
      "/mnt/c",
      "/opt/node.exe",
      "/opt/npm.cmd",
      "/opt/npm.bat",
    ]) {
      assert.ok(checkLinuxTarget({ ...linux, [field]: value }));
    }
    assert.equal(checkLinuxTarget({ ...linux, [field]: "/mnt/linux-volume/tool" }), undefined);
  }
});

test("blocks release packaging and unknown script arguments", () => {
  assert.match(checkLinuxMode("--deb"), /blocked.*maintainer metadata/);
  for (const mode of ["", "--install", "--publish", "--no-sandbox", "--dir --publish always"]) {
    assert.ok(checkLinuxMode(mode));
  }
});

test("the shell rejects release and install arguments without building", () => {
  const script = fileURLToPath(new URL("./package-linux.sh", import.meta.url));
  for (const args of [["--deb"], ["--install"], ["--dir", "--publish"]]) {
    const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /blocked|not supported/);
    assert.equal(result.stdout, "");
  }
});

test("the shell rejects a non-Linux host before building", { skip: process.platform === "linux" }, () => {
  const script = fileURLToPath(new URL("./package-linux.sh", import.meta.url));
  const result = spawnSync("bash", [script, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires Linux/);
  assert.equal(result.stdout, "");
});
