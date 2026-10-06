import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  packagedFfmpegEntry,
  packagedFfmpegPath,
  preparePackagedFfmpeg,
  replacePackagedFfmpeg,
} from "./prepare-packaged-ffmpeg.mjs";

test("FFmpeg archive selection uses the installed ZIP API and an exact library path", () => {
  const entry = {
    path: "libffmpeg.dylib",
    externalFileAttributes: 0o100755 << 16,
    uncompressedSize: 123,
    buffer: async () => Buffer.from("Library"),
  };
  assert.equal(packagedFfmpegEntry({ files: [entry] }, entry.path), entry);
  assert.throws(() => packagedFfmpegEntry({ files: [] }, entry.path), /exactly one/);
  assert.throws(() => packagedFfmpegEntry({ files: [entry, entry] }, entry.path), /exactly one/);
  assert.throws(
    () => packagedFfmpegEntry({ files: [{ ...entry, path: "../libffmpeg.dylib" }] }, entry.path),
    /exactly one/,
  );
  for (const attributes of [0o120755 << 16, 0o040755 << 16, 0x10])
    assert.throws(
      () => packagedFfmpegEntry({ files: [{ ...entry, externalFileAttributes: attributes }] }, entry.path),
      /regular file/,
    );
  assert.throws(
    () => packagedFfmpegEntry({ files: [{ ...entry, uncompressedSize: 0 }] }, entry.path),
    /regular file/,
  );
});

function fixture(context) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-packaged-ffmpeg-")));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  fs.mkdirSync(app);
  const target = path.join(app, "libffmpeg.so");
  fs.writeFileSync(target, "Original library", { mode: 0o755 });
  return { root, app, target };
}

test("packaged FFmpeg supports only the pinned macOS arm64 and Linux x64 targets", () => {
  assert.equal(
    packagedFfmpegPath("/app", "darwin", "arm64", "42.11.8"),
    "/app/Frameworks/Electron Framework.framework/Libraries/libffmpeg.dylib",
  );
  assert.equal(packagedFfmpegPath("/app", "linux", "x64", "42.11.8"), "/app/libffmpeg.so");
  for (const [platform, arch, version] of [
    ["darwin", "x64", "42.11.8"],
    ["linux", "arm64", "42.11.8"],
    ["win32", "x64", "42.11.8"],
    ["darwin", "arm64", "42.11.9"],
  ])
    assert.throws(() => packagedFfmpegPath("/app", platform, arch, version), /Unsupported/);
});

test("clean replacement preserves bytes and mode and checks the installed library", (context) => {
  const { app, target } = fixture(context);
  const bytes = Buffer.from("Clean library");
  const inspected = [];
  const result = replacePackagedFfmpeg(app, target, bytes, (file) => {
    assert.ok(fs.readFileSync(file).equals(bytes));
    inspected.push(file);
    return [{ name: "vorbis" }, { name: "pcm_s16le" }];
  });
  assert.equal(inspected.length, 2);
  assert.equal(inspected[1], target);
  assert.ok(fs.readFileSync(target).equals(bytes));
  assert.equal(fs.statSync(target).mode & 0o777, 0o755);
  assert.deepEqual(result.codecs, ["pcm_s16le", "vorbis"]);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(fs.readdirSync(app), ["libffmpeg.so"]);
});

test("proprietary or missing codecs preserve the existing packaged library", (context) => {
  const { app, target } = fixture(context);
  for (const codecs of [[], [null], [{ name: "H264" }], [{ name: " AAC " }], [{ name: "" }]]) {
    assert.throws(
      () => replacePackagedFfmpeg(app, target, Buffer.from("Unreviewed library"), () => codecs),
      /codec|H.264/,
    );
    assert.equal(fs.readFileSync(target, "utf8"), "Original library");
    assert.deepEqual(fs.readdirSync(app), ["libffmpeg.so"]);
  }
  assert.throws(() => replacePackagedFfmpeg(app, target, Buffer.alloc(0)), /Invalid/);
});

test("native inspection failures remove only the temporary library", (context) => {
  const { app, target } = fixture(context);
  fs.writeFileSync(path.join(app, "keep.txt"), "User file");
  assert.throws(
    () =>
      replacePackagedFfmpeg(app, target, Buffer.from("Clean library"), () => {
        throw new Error("Fixture native failure");
      }),
    /Fixture native failure/,
  );
  assert.equal(fs.readFileSync(target, "utf8"), "Original library");
  assert.equal(fs.readFileSync(path.join(app, "keep.txt"), "utf8"), "User file");
  assert.deepEqual(fs.readdirSync(app).sort(), ["keep.txt", "libffmpeg.so"]);
});

test("changed codec results after replacement stop packaging", (context) => {
  const { app, target } = fixture(context);
  let calls = 0;
  assert.throws(
    () =>
      replacePackagedFfmpeg(app, target, Buffer.from("Clean library"), () => [
        { name: ++calls === 1 ? "vorbis" : "mp3" },
      ]),
    /results change/,
  );
});

test("FFmpeg replacement rejects linked destinations outside the app", (context) => {
  const { root, app, target } = fixture(context);
  const outside = path.join(root, "outside.so");
  fs.writeFileSync(outside, "External library");
  fs.unlinkSync(target);
  fs.symlinkSync(outside, target);
  assert.throws(
    () => replacePackagedFfmpeg(app, target, Buffer.from("Clean library"), () => [{ name: "vorbis" }]),
    /escapes/,
  );
  assert.equal(fs.readFileSync(outside, "utf8"), "External library");
  assert.ok(fs.lstatSync(target).isSymbolicLink());
});

test("FFmpeg replacement follows framework directory links only within the app", (context) => {
  const { app } = fixture(context);
  const realLibrary = path.join(app, "Versions/A/Libraries/libffmpeg.dylib");
  fs.mkdirSync(path.dirname(realLibrary), { recursive: true });
  fs.writeFileSync(realLibrary, "Original library");
  fs.symlinkSync("Versions/A/Libraries", path.join(app, "Libraries"));
  const bytes = Buffer.from("Clean library");
  replacePackagedFfmpeg(app, path.join(app, "Libraries/libffmpeg.dylib"), bytes, () => [{ name: "vorbis" }]);
  assert.ok(fs.readFileSync(realLibrary).equals(bytes));
  assert.ok(fs.lstatSync(path.join(app, "Libraries")).isSymbolicLink());
});

test("archive checksum failure stops before extraction or library replacement", async (context) => {
  const { root, app } = fixture(context);
  const target = packagedFfmpegPath(app, process.platform, process.arch, "42.11.8");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "Original library");
  const archive = path.join(root, "archive.zip");
  fs.writeFileSync(archive, "Wrong archive bytes");
  let extraction = false;
  await assert.rejects(
    preparePackagedFfmpeg(
      { appRoot: app, platform: process.platform, arch: process.arch, electronVersion: "42.11.8" },
      {
        downloadArtifact: async (options) => {
          assert.equal(options.artifactName, "ffmpeg");
          assert.equal(options.version, "42.11.8");
          assert.equal(Object.keys(options.checksums).length, 1);
          assert.equal(options.unsafelyDisableChecksums, undefined);
          return archive;
        },
        openArchive: async () => {
          extraction = true;
        },
      },
    ),
    /checksum mismatch/,
  );
  assert.equal(extraction, false);
  assert.equal(fs.readFileSync(target, "utf8"), "Original library");
});

test("cross-platform FFmpeg preparation stops before downloading", async (context) => {
  const { app } = fixture(context);
  let download = false;
  const target =
    process.platform === "darwin"
      ? { platform: "linux", arch: "x64" }
      : { platform: "darwin", arch: "arm64" };
  await assert.rejects(
    preparePackagedFfmpeg(
      { appRoot: app, ...target, electronVersion: "42.11.8" },
      {
        downloadArtifact: async () => {
          download = true;
        },
      },
    ),
    /native target host/,
  );
  assert.equal(download, false);
});
