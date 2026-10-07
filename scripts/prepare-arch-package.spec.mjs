import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { test } from "node:test";
import { prepareArchPackage } from "./prepare-arch-package.mjs";
import { createHash } from "node:crypto";
import { generateDistributionNotices } from "./distribution-notices.mjs";
import { prepareNativeHelpers } from "./prepare-native-helpers.mjs";

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

function generatedNoticeFixture(root) {
  const input = fixture(root);
  const app = path.join(input, "resources/app");
  const manifest = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ ...manifest, name: "ai1-electron", license: "MIT" }),
  );
  const dependency = path.join(app, "node_modules/fixture-package");
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(
    path.join(dependency, "package.json"),
    JSON.stringify({ name: "fixture-package", version: "1.0.0", license: "MIT" }),
  );
  fs.writeFileSync(path.join(dependency, "LICENSE"), "fixture package notice");
  fs.writeFileSync(path.join(input, "LICENSES.chromium.html"), "fixture runtime notice");
  const noticeRoot = path.join(app, "resources/notices");
  const notices = generateDistributionNotices(input, noticeRoot, path.join(input, "LICENSE"));
  assert.deepEqual(notices.unresolved, []);
  return { input, noticeRoot, notices };
}

test("Arch preparation accepts the Linux afterPack notice generator roots", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-generated-notices-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { input, notices } = generatedNoticeFixture(root);
  const paths = notices.notices.map((notice) => notice.path);
  assert.ok(paths.includes("LICENSE"));
  assert.ok(paths.includes("LICENSES.chromium.html"));
  assert.ok(paths.includes("resources/app/node_modules/fixture-package/LICENSE"));
  assert.ok(prepareArchPackage(input, path.join(root, "output")));
});

test("copied Linux helper modes pass real Arch staging only after packaging preparation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-native-helper-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { input } = generatedNoticeFixture(root);
  const payload = path.join(input, "resources/app");
  const helpers = ["lib/backend/native/rg", "lib/prebuilds/linux-x64/pty.node"];
  for (const name of helpers) {
    const file = path.join(payload, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `fixture ${name}`);
    fs.chmodSync(file, 0o777);
  }
  const output = path.join(root, "output");
  assert.throws(() => prepareArchPackage(input, output), /writable file modes/);
  assert.equal(fs.existsSync(output), false);
  prepareNativeHelpers({ payload, platform: "linux", arch: "x64" });
  assert.ok(prepareArchPackage(input, output));
  const archive = fs.readdirSync(output).find((file) => file.endsWith(".tar.gz"));
  const listing = execFileSync("tar", ["-tvzf", path.join(output, archive)], { encoding: "utf8" });
  assert.match(listing, /-rwxr-xr-x[^\n]*lib\/backend\/native\/rg/);
  assert.match(listing, /-rw-r--r--[^\n]*lib\/prebuilds\/linux-x64\/pty\.node/);
});

test("generated Linux notices still reject changed bytes, escaping paths, and unresolved entries", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-generated-guards-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { input, noticeRoot, notices } = generatedNoticeFixture(root);
  const output = path.join(root, "output");
  const runtime = notices.notices.find((notice) => notice.path === "LICENSES.chromium.html");
  const dependencyLicense = path.join(input, "resources/app/node_modules/fixture-package/LICENSE");
  // Check runtime, package, and copied notice bytes against the real manifest.
  for (const file of [
    path.join(input, runtime.path),
    dependencyLicense,
    path.join(noticeRoot, runtime.text),
  ]) {
    const original = fs.readFileSync(file);
    fs.writeFileSync(file, "changed notice bytes");
    assert.throws(() => prepareArchPackage(input, output), /checksum/);
    assert.equal(fs.existsSync(output), false);
    fs.writeFileSync(file, original);
  }
  const manifest = path.join(noticeRoot, "manifest.json");
  const original = fs.readFileSync(manifest);
  const escapingText = path.join(noticeRoot, "texts/escape.txt");
  fs.symlinkSync(path.relative(path.dirname(escapingText), path.join(input, "LICENSE")), escapingText);
  for (const record of [
    { ...runtime, path: "../LICENSE" },
    { ...runtime, text: "../LICENSE" },
    { ...runtime, text: "texts/escape.txt" },
  ]) {
    fs.writeFileSync(manifest, JSON.stringify({ ...notices, notices: [record] }));
    assert.throws(() => prepareArchPackage(input, output), /Invalid distribution notice file/);
    assert.equal(fs.existsSync(output), false);
  }
  fs.unlinkSync(escapingText);
  fs.writeFileSync(manifest, original);
  fs.unlinkSync(dependencyLicense);
  const unresolved = generateDistributionNotices(input, noticeRoot, path.join(input, "LICENSE"));
  assert.ok(unresolved.unresolved.length > 0);
  assert.throws(() => prepareArchPackage(input, output), /unresolved entries/);
  assert.equal(fs.existsSync(output), false);
});

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

test("Arch preparation rejects nested output and preserves existing output", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-paths-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = fixture(root);
  for (const output of [path.join(input, "output"), path.join(input, "new/nested/output")]) {
    assert.throws(() => prepareArchPackage(input, output), /outside the app input/);
    assert.equal(fs.existsSync(output), false);
  }
  fs.symlinkSync(input, path.join(root, "alias"));
  assert.throws(() => prepareArchPackage(input, path.join(root, "alias/output")), /outside the app input/);
  const output = path.join(root, "output");
  fs.symlinkSync(path.join(root, "missing"), output);
  assert.throws(() => prepareArchPackage(input, output), /already exists/);
  assert.equal(fs.lstatSync(output).isSymbolicLink(), true);
});

test("Arch preparation rejects unsafe modes and external links before staging", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-modes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = fixture(root);
  const output = path.join(root, "output");
  const executable = path.join(input, "ai1");
  fs.chmodSync(executable, 0o644);
  assert.throws(() => prepareArchPackage(input, output), /executable permission/);
  for (const mode of [0o4755, 0o2755, 0o777]) {
    fs.chmodSync(executable, mode);
    assert.throws(() => prepareArchPackage(input, output), /file modes/);
  }
  fs.chmodSync(executable, 0o755);
  const external = path.join(root, "external");
  fs.writeFileSync(external, "keep");
  const link = path.join(input, "link");
  for (const target of [external, "../external", "missing"]) {
    fs.symlinkSync(target, link);
    assert.throws(() => prepareArchPackage(input, output));
    fs.unlinkSync(link);
  }
  assert.equal(fs.readFileSync(external, "utf8"), "keep");
  assert.equal(fs.existsSync(output), false);
  fs.symlinkSync("ai1", link);
  assert.ok(prepareArchPackage(input, output));
  const extracted = path.join(root, "extracted");
  fs.mkdirSync(extracted);
  const archive = fs.readdirSync(output).find((file) => file.endsWith(".tar.gz"));
  execFileSync("tar", ["-xzf", path.join(output, archive), "-C", extracted]);
  const app = fs.readdirSync(extracted)[0];
  assert.equal(fs.readlinkSync(path.join(extracted, app, "link")), "ai1");
});

test("Arch preparation checks notice bytes and rejects paths outside the payload", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-notices-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = fixture(root);
  const payload = path.join(input, "resources/app");
  const noticeRoot = path.join(payload, "resources/notices");
  fs.writeFileSync(path.join(payload, "LICENSE"), "notice bytes");
  fs.writeFileSync(path.join(noticeRoot, "copy.txt"), "notice bytes");
  const sha256 = createHash("sha256").update("notice bytes").digest("hex");
  const notice = { path: "resources/app/LICENSE", text: "copy.txt", sha256 };
  const writeManifest = (record) =>
    fs.writeFileSync(
      path.join(noticeRoot, "manifest.json"),
      JSON.stringify({ schemaVersion: 1, packages: [], unresolved: [], notices: [record] }),
    );
  const output = path.join(root, "output");
  for (const record of [
    { ...notice, sha256: "bad" },
    { ...notice, sha256: "0".repeat(64) },
    { ...notice, path: "../../../LICENSE" },
    { ...notice, text: "../../LICENSE" },
    { ...notice, path: path.join(payload, "LICENSE") },
  ]) {
    writeManifest(record);
    assert.throws(() => prepareArchPackage(input, output), /notice/);
    assert.equal(fs.existsSync(output), false);
  }
  writeManifest(notice);
  fs.writeFileSync(path.join(noticeRoot, "copy.txt"), "changed bytes");
  assert.throws(() => prepareArchPackage(input, output), /checksum/);
  fs.writeFileSync(path.join(noticeRoot, "copy.txt"), "notice bytes");
  assert.ok(prepareArchPackage(input, output));
});

test("the launcher preserves workspace arguments and the app exit status", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-launcher-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "test-app");
  const log = path.join(root, "arguments");
  fs.writeFileSync(app, '#!/bin/sh\nprintf "%s\\n" "$@" > "$LAUNCH_TEST_LOG"\nexit 23\n', { mode: 0o755 });
  const launcher = fs.readFileSync(new URL("../packaging/arch/ai1", import.meta.url), "utf8");
  assert.equal(launcher, '#!/bin/sh\nexec /opt/ai1/ai1 "$@"\n');
  const stagedLauncher = path.join(root, "launcher");
  // Use a test app instead of the system installation path.
  fs.writeFileSync(stagedLauncher, launcher.replace("/opt/ai1/ai1", '"$LAUNCH_TEST_APP"'));
  const args = ["/home/test/workspace with spaces", "--wait", "", "*.ts", "-file"];
  assert.throws(
    () =>
      execFileSync("sh", [stagedLauncher, ...args], {
        env: { ...process.env, LAUNCH_TEST_APP: app, LAUNCH_TEST_LOG: log },
        stdio: "pipe",
      }),
    (error) => error.status === 23,
  );
  assert.deepEqual(fs.readFileSync(log, "utf8").split("\n").slice(0, -1), args);
  const desktop = fs.readFileSync(new URL("../packaging/arch/ai1.desktop", import.meta.url), "utf8");
  assert.match(desktop, /^Exec=ai1 %F$/m);
  assert.match(desktop, /^TryExec=ai1$/m);
  assert.doesNotMatch(launcher + desktop, /--no-sandbox|password-store|remote-debugging/);
});

test("separate version staging keeps rollback inputs and user files unchanged", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-lifecycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userFile = path.join(root, "user-data/layout.json");
  fs.mkdirSync(path.dirname(userFile));
  fs.writeFileSync(userFile, '{"split":"saved"}');
  const stages = [];
  for (const version of ["0.1.0", "0.1.1"]) {
    const checkout = path.join(root, version);
    fs.mkdirSync(path.join(checkout, "applications/electron"), { recursive: true });
    fs.mkdirSync(path.join(checkout, "packaging"));
    fs.cpSync(new URL("../packaging/arch", import.meta.url), path.join(checkout, "packaging/arch"), {
      recursive: true,
    });
    fs.copyFileSync(new URL("../LICENSE", import.meta.url), path.join(checkout, "LICENSE"));
    fs.writeFileSync(path.join(checkout, "applications/electron/package.json"), JSON.stringify({ version }));
    const input = fixture(checkout);
    fs.writeFileSync(path.join(input, "resources/app/package.json"), JSON.stringify({ version }));
    const output = path.join(checkout, "package");
    const pkgbuild = prepareArchPackage(input, output, checkout);
    const source = path.join(checkout, "source");
    const installed = path.join(checkout, "installed");
    fs.mkdirSync(source);
    const archive = path.join(output, `ai1-${version}-linux-x64.tar.gz`);
    execFileSync("tar", ["-xzf", archive, "-C", source]);
    for (const name of ["ai1", "ai1.desktop", "LICENSE"])
      fs.copyFileSync(path.join(output, name), path.join(source, name));
    execFileSync("bash", [
      "-c",
      'source "$1"; srcdir="$2"; pkgdir="$3"; package',
      "fixture",
      pkgbuild,
      source,
      installed,
    ]);
    const files = [];
    const visit = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) visit(file);
        else files.push(path.relative(installed, file));
      }
    };
    visit(installed);
    assert.ok(files.every((file) => file.startsWith("opt/ai1/") || file.startsWith("usr/")));
    for (const [file, mode] of [
      ["usr/bin/ai1", 0o755],
      ["usr/share/applications/ai1.desktop", 0o644],
      ["usr/share/pixmaps/ai1.png", 0o644],
    ])
      assert.equal(fs.statSync(path.join(installed, file)).mode & 0o7777, mode);
    const build = fs.readFileSync(pkgbuild, "utf8");
    assert.doesNotMatch(
      build,
      /^install=|pre_install|post_install|pre_upgrade|post_upgrade|pre_remove|post_remove|systemctl|tmux (kill|send)/m,
    );
    stages.push({
      installed,
      archive,
      files: files.sort(),
      hash: createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    });
  }
  // Compare package paths without simulating a pacman transaction.
  assert.deepEqual(stages[0].files, stages[1].files);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(stages[0].installed, "opt/ai1/resources/app/package.json"))).version,
    "0.1.0",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(stages[1].installed, "opt/ai1/resources/app/package.json"))).version,
    "0.1.1",
  );
  assert.equal(createHash("sha256").update(fs.readFileSync(stages[0].archive)).digest("hex"), stages[0].hash);
  assert.equal(fs.readFileSync(userFile, "utf8"), '{"split":"saved"}');
});

test("Arch preparation rejects version mismatches and invalid notice manifests", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-arch-metadata-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = fixture(root);
  const output = path.join(root, "output");
  const manifest = path.join(input, "resources/app/package.json");
  const original = fs.readFileSync(manifest);
  fs.writeFileSync(manifest, JSON.stringify({ version: "999.0.0" }));
  assert.throws(() => prepareArchPackage(input, output), /version does not match/);
  fs.writeFileSync(manifest, original);
  const notices = path.join(input, "resources/app/resources/notices/manifest.json");
  for (const record of [
    null,
    {},
    { schemaVersion: 2, notices: [], packages: [], unresolved: [] },
    { schemaVersion: 1, notices: [], packages: [] },
  ]) {
    fs.writeFileSync(notices, JSON.stringify(record));
    assert.throws(() => prepareArchPackage(input, output), /Invalid distribution notice manifest/);
    assert.equal(fs.existsSync(output), false);
  }
});
