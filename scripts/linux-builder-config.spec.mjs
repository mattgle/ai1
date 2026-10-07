import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { getConfig, validateConfiguration } = require("app-builder-lib/out/util/config/config");
const { DebugLogger } = require("builder-util");
const appDirectory = fileURLToPath(new URL("../applications/electron/", import.meta.url));

test("Linux configuration passes the pinned builder schema and keeps shared packaging rules", async () => {
  const shared = await getConfig(appDirectory, path.join(appDirectory, "electron-builder.yml"));
  const linux = await getConfig(appDirectory, path.join(appDirectory, "electron-builder-linux.yml"));
  await validateConfiguration(linux, new DebugLogger());
  for (const field of [
    "appId",
    "productName",
    "electronVersion",
    "asar",
    "npmRebuild",
    "files",
    "mac",
    "afterPack",
  ]) {
    assert.deepEqual(linux[field], shared[field], field);
  }
  assert.equal(linux.afterPack, "./scripts/distribution-notices.cjs");
  assert.ok(
    linux.files.some((entry) => entry.filter.includes("!**/node_modules/fast-uri/benchmark{,/**/*}")),
  );
  assert.deepEqual(linux.linux.target, [{ target: "deb", arch: ["x64"] }]);
  assert.equal(linux.linux.artifactName, "AI1-${version}-linux-${arch}.${ext}");
  assert.equal(linux.linux.icon, "resources/branding/icon-dark.png");
  assert.ok(fs.statSync(path.join(appDirectory, linux.linux.icon)).isFile());
});
