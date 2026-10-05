import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { test } from "node:test";
import { prepareArchPackage } from "./prepare-arch-package.mjs";

function fixture(root) {
  const input = path.join(root, "linux-unpacked");
  const app = path.join(input, "resources/app");
  fs.mkdirSync(path.join(app, "resources/branding"), { recursive: true });
  fs.mkdirSync(path.join(app, "resources/notices"));
  const version = JSON.parse(
    fs.readFileSync(new URL("../applications/electron/package.json", import.meta.url)),
  ).version;
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ version }));
  fs.writeFileSync(path.join(app, "resources/branding/icon-dark.png"), "fixture");
  fs.writeFileSync(
    path.join(app, "resources/notices/manifest.json"),
    JSON.stringify({ schemaVersion: 1, packages: [], notices: [], unresolved: [] }),
  );
  for (const file of ["LICENSE", "LICENSES.chromium.html"])
    fs.writeFileSync(path.join(input, file), "fixture license");
  const elf = Buffer.alloc(20);
  elf.writeUInt32BE(0x7f454c46);
  elf[4] = 2;
  elf[5] = 1;
  elf.writeUInt16LE(62, 18);
  fs.writeFileSync(path.join(input, "ai1"), elf, { mode: 0o755 });
  return input;
}

test("Arch inputs use checksums and keep install files separate from user data", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-"));
  try {
    const input = fixture(root);
    const output = path.join(root, "package");
    const pkgbuild = fs.readFileSync(prepareArchPackage(input, output), "utf8");
    assert.match(pkgbuild, /arch=\('x86_64'\)/);
    assert.match(pkgbuild, /\/opt\/ai1/);
    assert.doesNotMatch(pkgbuild, /@[A-Z_]+@|SKIP|--no-sandbox|chmod.*4755|\.config|\.local/);
    assert.equal((pkgbuild.match(/'[a-f0-9]{64}'/g) ?? []).length, 4);
    execFileSync("bash", ["-n", path.join(output, "PKGBUILD")]);
    const source = path.join(root, "source");
    const installed = path.join(root, "installed");
    fs.mkdirSync(source);
    const archive = fs.readdirSync(output).find((file) => file.endsWith(".tar.gz"));
    execFileSync("tar", ["-xzf", path.join(output, archive), "-C", source]);
    for (const name of ["ai1", "ai1.desktop", "LICENSE"])
      fs.copyFileSync(path.join(output, name), path.join(source, name));
    execFileSync("bash", [
      "-c",
      'source "$1"; srcdir="$2"; pkgdir="$3"; package',
      "fixture",
      path.join(output, "PKGBUILD"),
      source,
      installed,
    ]);
    assert.equal(fs.existsSync(path.join(installed, "opt/ai1/ai1")), true);
    assert.equal(
      fs.readFileSync(path.join(installed, "usr/bin/ai1"), "utf8"),
      '#!/bin/sh\nexec /opt/ai1/ai1 "$@"\n',
    );
    assert.equal(fs.existsSync(path.join(installed, "usr/share/applications/ai1.desktop")), true);
    assert.equal(fs.existsSync(path.join(installed, "usr/share/licenses/ai1/LICENSE")), true);
    assert.equal(fs.existsSync(path.join(installed, "home")), false);
    assert.throws(() => prepareArchPackage(input, output), /already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Arch packaging rejects non-Linux binaries and unresolved notices", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-"));
  try {
    const input = fixture(root);
    const manifest = path.join(input, "resources/app/resources/notices/manifest.json");
    fs.writeFileSync(
      manifest,
      JSON.stringify({ schemaVersion: 1, packages: [], notices: [], unresolved: [{ path: "missing" }] }),
    );
    assert.throws(() => prepareArchPackage(input, path.join(root, "output")), /unresolved/);
    fs.writeFileSync(
      manifest,
      JSON.stringify({ schemaVersion: 1, packages: [], notices: [], unresolved: [] }),
    );
    fs.writeFileSync(path.join(input, "ai1"), Buffer.alloc(20));
    assert.throws(() => prepareArchPackage(input, path.join(root, "output")), /Linux x64 ELF/);
    assert.equal(fs.existsSync(path.join(root, "output")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
