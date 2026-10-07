import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import tar from "tar-stream";
import {
  patchReviewedBuildFile,
  readReviewedTarFiles,
  reviewFfmpegSource,
  verifySourceBytes,
} from "./review-ffmpeg-source.mjs";

function record(name, bytes) {
  return { path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function archive(entries) {
  const pack = tar.pack();
  const chunks = [];
  pack.on("data", (chunk) => chunks.push(chunk));
  const ended = once(pack, "end");
  for (const entry of entries) pack.entry(entry.header, entry.bytes);
  pack.finalize();
  await ended;
  return Buffer.concat(chunks);
}

test("review reads exact selected bytes without an extraction folder", async () => {
  const bytes = Buffer.from("source\n");
  const data = await archive([
    { header: { name: "unreviewed.txt" }, bytes: Buffer.from("other") },
    { header: { name: "BUILD.gn" }, bytes },
  ]);
  const result = await readReviewedTarFiles(data, [record("BUILD.gn", bytes)]);
  assert.equal(result.entries, 2);
  assert.deepEqual(result.files.get("BUILD.gn"), bytes);
});

test("review rejects changed bytes and wrong sizes", () => {
  const bytes = Buffer.from("source\n");
  const expected = record("BUILD.gn", bytes);
  assert.throws(() => verifySourceBytes(Buffer.from("change\n"), expected), /SHA-256/);
  assert.throws(() => verifySourceBytes(Buffer.from("source"), expected), /size/);
});

test("review rejects absent, duplicate, linked, and changed source entries", async () => {
  const bytes = Buffer.from("source\n");
  const expected = [record("BUILD.gn", bytes)];
  const entry = { header: { name: "BUILD.gn" }, bytes };
  await assert.rejects(readReviewedTarFiles(await archive([]), expected), /absent/);
  await assert.rejects(readReviewedTarFiles(await archive([entry, entry]), expected), /Duplicate/);
  await assert.rejects(
    readReviewedTarFiles(
      await archive([{ header: { name: "BUILD.gn", type: "symlink", linkname: "other" } }]),
      expected,
    ),
    /non-file/,
  );
  await assert.rejects(
    readReviewedTarFiles(
      await archive([{ header: { name: "BUILD.gn" }, bytes: Buffer.from("change\n") }]),
      expected,
    ),
    /SHA-256/,
  );
  await assert.rejects(
    readReviewedTarFiles(
      await archive([{ header: { name: "BUILD.gn" }, bytes: Buffer.from("short") }]),
      expected,
    ),
    /wrong-size/,
  );
  await assert.rejects(readReviewedTarFiles(await archive([entry]), [...expected, ...expected]), /record/);
});

test("review changes only the install-name line and rejects ambiguous inputs", () => {
  const line = '        ldflags += [ "-Wl,-install_name,@rpath/libffmpeg.dylib" ]';
  const source = Buffer.from(`before\n${line}\nafter\n`);
  assert.equal(
    patchReviewedBuildFile(source).toString(),
    `before\n${line.replace("@rpath", "@loader_path")}\nafter\n`,
  );
  assert.throws(() => patchReviewedBuildFile(Buffer.from("other")), /absent/);
  assert.throws(() => patchReviewedBuildFile(Buffer.from(`${line}\n${line}\n`)), /ambiguous/);
  assert.throws(() => patchReviewedBuildFile(patchReviewedBuildFile(source)), /absent/);
});

test("retained patch and clean settings keep exact upstream bytes", () => {
  const root = new URL("../applications/electron/resources/third-party/ffmpeg-source/", import.meta.url);
  const review = JSON.parse(readFileSync(new URL("source-review.json", root), "utf8"));
  for (const input of review.retainedInputs) {
    verifySourceBytes(readFileSync(new URL(input.path, root)), input);
  }
  assert.equal(review.publicationAttestations.sourceRevision, review.electron.revision);
});

test("review rejects an unverified archive before decompression", async () => {
  const file = new URL(
    "../applications/electron/resources/third-party/ffmpeg-source/link_with_loader_path.patch",
    import.meta.url,
  );
  await assert.rejects(reviewFfmpegSource(file), /size and SHA-256/);
});
