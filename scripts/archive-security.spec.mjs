import * as assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const tarStream = require("tar-stream");
const applicationRequire = process.env.AI1_PACKAGED_RESOURCES
  ? createRequire(pathToFileURL(path.resolve(process.env.AI1_PACKAGED_RESOURCES, "package.json")))
  : require;
const { PluginDeployerFileHandlerContextImpl } = applicationRequire(
  "@theia/plugin-ext/lib/main/node/plugin-deployer-file-handler-context-impl",
);

async function archive(entries) {
  const pack = tarStream.pack();
  const buffers = [];
  pack.on("data", (data) => buffers.push(data));
  const completed = new Promise((resolve, reject) => {
    pack.on("end", () => resolve(Buffer.concat(buffers)));
    pack.on("error", reject);
  });
  for (const entry of entries) {
    pack.entry({ name: entry.name, type: entry.type || "file", linkname: entry.linkname }, entry.data || "");
  }
  pack.finalize();
  return completed;
}

async function fixture(t, entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai1-archive-security-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "extension.tar");
  const output = path.join(root, "extracted");
  const outside = path.join(root, "extracted-other");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "private.txt"), "private fixture data");
  await fs.writeFile(
    input,
    await archive(typeof entries === "function" ? entries({ root, output, outside }) : entries),
  );
  const context = new PluginDeployerFileHandlerContextImpl({});
  return { root, output, outside, extract: () => context.unzip(input, output) };
}

test("Theia extracts valid archives through the dependency API", async (t) => {
  const f = await fixture(t, [{ name: "extension/package.json", data: '{"name":"fixture"}' }]);
  await f.extract();
  assert.equal(
    await fs.readFile(path.join(f.output, "extension/package.json"), "utf8"),
    '{"name":"fixture"}',
  );
});

test("Theia rejects symlinks that escape into a sibling with the same path prefix", async (t) => {
  const f = await fixture(t, [{ name: "escape", type: "symlink", linkname: "../extracted-other" }]);
  await assert.rejects(f.extract());
  assert.equal(await fs.readFile(path.join(f.outside, "private.txt"), "utf8"), "private fixture data");
  await assert.rejects(fs.lstat(path.join(f.output, "escape")), { code: "ENOENT" });
});

test("Theia rejects hardlinks to files outside the extraction root", async (t) => {
  const f = await fixture(t, ({ outside }) => [
    { name: "leaked.txt", type: "link", linkname: path.join(outside, "private.txt") },
  ]);
  await assert.rejects(f.extract());
  await assert.rejects(fs.lstat(path.join(f.output, "leaked.txt")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(f.outside, "private.txt"), "utf8"), "private fixture data");
});
