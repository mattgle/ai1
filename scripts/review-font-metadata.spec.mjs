import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { brotliCompressSync, deflateSync } from "node:zlib";
import { inspectFontMetadata } from "./review-font-metadata.mjs";

function nameTable(records) {
  const header = Buffer.alloc(6 + records.length * 12);
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(header.length, 4);
  const strings = [];
  let position = 0;
  records.forEach((record, index) => {
    const data = record.raw ?? Buffer.from(record.text, "utf16le").swap16();
    const offset = 6 + index * 12;
    header.writeUInt16BE(record.platform ?? 3, offset);
    header.writeUInt16BE(record.encoding ?? 1, offset + 2);
    header.writeUInt16BE(record.language ?? 1033, offset + 4);
    header.writeUInt16BE(record.id, offset + 6);
    header.writeUInt16BE(data.length, offset + 8);
    header.writeUInt16BE(position, offset + 10);
    position += data.length;
    strings.push(data);
  });
  return Buffer.concat([header, ...strings]);
}

function sfnt(table) {
  const header = Buffer.alloc(28);
  header.writeUInt32BE(0x00010000);
  header.writeUInt16BE(1, 4);
  header.write("name", 12, "ascii");
  header.writeUInt32BE(header.length, 20);
  header.writeUInt32BE(table.length, 24);
  return Buffer.concat([header, table]);
}

function woff(table, compress = true) {
  const compressed = deflateSync(table);
  const data = compress && compressed.length < table.length ? compressed : table;
  const header = Buffer.alloc(64);
  header.write("wOFF");
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(header.length + data.length, 8);
  header.writeUInt16BE(1, 12);
  header.write("name", 44);
  header.writeUInt32BE(header.length, 48);
  header.writeUInt32BE(data.length, 52);
  header.writeUInt32BE(table.length, 56);
  return Buffer.concat([header, data]);
}

function base128(value) {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
  return Buffer.from(bytes);
}

function woff2(table, extraTables = [], xml) {
  const tables = [...extraTables, { flags: 5, original: table.length, data: table }];
  const directory = Buffer.concat(
    tables.map((entry) =>
      Buffer.concat([
        Buffer.from([entry.flags]),
        base128(entry.original),
        ...(entry.transformed ? [base128(entry.data.length)] : []),
      ]),
    ),
  );
  const compressed = brotliCompressSync(Buffer.concat(tables.map((entry) => entry.data)));
  const header = Buffer.alloc(48);
  header.write("wOF2");
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt32BE(compressed.length, 20);
  const metadata = xml ? brotliCompressSync(Buffer.from(xml)) : Buffer.alloc(0);
  if (metadata.length) {
    header.writeUInt32BE(header.length + directory.length + compressed.length, 28);
    header.writeUInt32BE(metadata.length, 32);
    header.writeUInt32BE(Buffer.byteLength(xml), 36);
  }
  header.writeUInt32BE(header.length + directory.length + compressed.length + metadata.length, 8);
  return Buffer.concat([header, directory, compressed, metadata]);
}

const table = nameTable([
  { id: 0, text: "Copyright © Fixture 2026" },
  { id: 1, text: "Fixture Font" },
  { id: 13, text: "Exact fixture terms. ".repeat(20) },
  { id: 14, text: "https://example.invalid/license" },
]);

test("SFNT, WOFF, and WOFF2 retain the same exact name records", () => {
  const reports = [sfnt(table), woff(table), woff(table, false), woff2(table)].map(inspectFontMetadata);
  for (const report of reports) {
    assert.equal(report.nameTable.sha256, createHash("sha256").update(table).digest("hex"));
    assert.deepEqual(
      report.nameTable.records.map((record) => record.text),
      [
        "Copyright © Fixture 2026",
        "Fixture Font",
        "Exact fixture terms. ".repeat(20),
        "https://example.invalid/license",
      ],
    );
    assert.equal(report.extendedMetadata.present, false);
    assert.equal(report.privateData.present, false);
  }
});

test("WOFF2 name offsets use transformed lengths without reconstructing glyphs", () => {
  const bytes = woff2(table, [
    { flags: 10, original: 1000, transformed: true, data: Buffer.from("glyf") },
    { flags: 11, original: 200, transformed: true, data: Buffer.alloc(0) },
    { flags: 67, original: 300, transformed: true, data: Buffer.from("hmtx") },
  ]);
  assert.equal(
    inspectFontMetadata(bytes).nameTable.sha256,
    inspectFontMetadata(sfnt(table)).nameTable.sha256,
  );
});

test("absent records, empty text, and unsupported encodings stay distinct", () => {
  const report = inspectFontMetadata(
    sfnt(
      nameTable([
        { id: 13, text: "" },
        { id: 14, platform: 4, encoding: 0, raw: Buffer.from([1, 2]) },
        { id: 0, platform: 1, encoding: 0, raw: Buffer.from([0xa9, 32, 65]) },
      ]),
    ),
  );
  assert.equal(
    report.nameTable.records.find((record) => record.nameID === 1),
    undefined,
  );
  assert.equal(report.nameTable.records[0].text, "");
  assert.equal(report.nameTable.records[1].text, null);
  assert.equal(report.nameTable.records[1].rawBase64, "AQI=");
  assert.equal(report.nameTable.records[2].text, "© A");
});

test("WOFF2 extended XML metadata stays exact and separate from name records", () => {
  const xml = '<metadata version="1.0"><license><text>Fixture terms.</text></license></metadata>';
  const report = inspectFontMetadata(woff2(table, [], xml));
  assert.equal(report.extendedMetadata.text, xml);
  assert.equal(report.extendedMetadata.sha256, createHash("sha256").update(xml).digest("hex"));
});

test("private blocks stay uninterpreted and overlapping metadata is rejected", () => {
  const original = woff2(table);
  const privateBytes = Buffer.from("Private fixture");
  const bytes = Buffer.concat([original, privateBytes]);
  bytes.writeUInt32BE(bytes.length, 8);
  bytes.writeUInt32BE(original.length, 40);
  bytes.writeUInt32BE(privateBytes.length, 44);
  const report = inspectFontMetadata(bytes);
  assert.equal(report.privateData.present, true);
  assert.equal(report.privateData.sha256, createHash("sha256").update(privateBytes).digest("hex"));
  assert.equal(report.privateData.scope, "Not interpreted.");
  bytes.writeUInt32BE(48, 40);
  assert.throws(() => inspectFontMetadata(bytes), /private-data/);
});

test("missing and duplicate name tables do not become inferred notices", () => {
  const missing = sfnt(table);
  missing.write("head", 12);
  assert.throws(() => inspectFontMetadata(missing), /absent/);
  const duplicate = Buffer.alloc(44 + table.length * 2);
  duplicate.writeUInt32BE(0x00010000);
  duplicate.writeUInt16BE(2, 4);
  for (const offset of [12, 28]) {
    duplicate.write("name", offset);
    duplicate.writeUInt32BE(offset === 12 ? 44 : 44 + table.length, offset + 8);
    duplicate.writeUInt32BE(table.length, offset + 12);
  }
  table.copy(duplicate, 44);
  table.copy(duplicate, 44 + table.length);
  assert.throws(() => inspectFontMetadata(duplicate), /Duplicate/);
});

test("truncated input, bad offsets, and invalid text fail instead of guessing", () => {
  assert.throws(() => inspectFontMetadata(Buffer.from("wOF2")), /range/);
  const invalid = sfnt(table);
  invalid.writeUInt32BE(1, 20);
  assert.throws(() => inspectFontMetadata(invalid), /offset/);
  const wrongString = Buffer.from(table);
  wrongString.writeUInt16BE(1, 4);
  assert.throws(() => inspectFontMetadata(sfnt(wrongString)), /overlap/);
  assert.throws(() => inspectFontMetadata(sfnt(nameTable([{ id: 13, raw: Buffer.from([1]) }]))));
  assert.throws(() => inspectFontMetadata(Buffer.alloc(16 * 1024 * 1024 + 1)), /limit/);
});

test("WOFF2 rejects unsupported transforms, malformed lengths, and collections", () => {
  const unknown = woff2(table);
  unknown[48] = 133;
  assert.throws(() => inspectFontMetadata(unknown), /transformation/);
  const leadingZero = woff2(table);
  leadingZero[49] = 0x80;
  assert.throws(() => inspectFontMetadata(leadingZero), /UIntBase128/);
  const collection = woff2(table);
  collection.writeUInt32BE(0x74746366, 4);
  assert.throws(() => inspectFontMetadata(collection), /collections/);
  const inconsistent = woff2(table);
  inconsistent[inconsistent[49] & 0x80 ? 50 : 49]++;
  assert.throws(() => inspectFontMetadata(inconsistent), /data length/);
});

test("reviewed installed font bytes and embedded fields match the retained evidence", () => {
  const root = new URL("../", import.meta.url);
  const review = JSON.parse(
    readFileSync(
      new URL("applications/electron/resources/third-party/font-metadata/review.json", root),
      "utf8",
    ),
  );
  for (const font of review.fontFiles) {
    const packageRoot = `node_modules/${font.package}/`;
    assert.equal(
      JSON.parse(readFileSync(new URL(packageRoot + "package.json", root), "utf8")).version,
      font.version,
    );
    const actual = inspectFontMetadata(readFileSync(new URL(packageRoot + font.path, root)));
    const expected = review.nameTables[font.nameTable];
    assert.equal(actual.bytes, font.bytes);
    assert.equal(actual.sha256, font.sha256);
    assert.equal(actual.nameTable.bytes, expected.bytes);
    assert.equal(actual.nameTable.sha256, expected.sha256);
    assert.deepEqual(
      [...new Set(actual.nameTable.records.map((record) => record.nameID))],
      expected.recordIDs,
    );
    for (const [id, text] of Object.entries(expected.fields)) {
      const records = actual.nameTable.records.filter((record) => record.nameID === Number(id));
      assert.ok(records.length > 0);
      assert.ok(records.every((record) => record.text === text));
    }
    for (const id of expected.absentFieldIDs)
      assert.equal(
        actual.nameTable.records.some((record) => record.nameID === id),
        false,
      );
    assert.equal(actual.extendedMetadata.present, expected.extendedMetadataPresent);
    assert.equal(actual.privateData.present, expected.privateDataPresent);
  }
  assert.deepEqual(review.proposedLicenseSupplementMappings, []);
});
