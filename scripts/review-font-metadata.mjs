import * as fs from "node:fs";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { brotliDecompressSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const limit = 16 * 1024 * 1024;
const metadataLimit = 2 * 1024 * 1024;
const tags = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function slice(bytes, offset, length) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.length
  )
    throw new Error("Font byte range is invalid.");
  return bytes.subarray(offset, offset + length);
}

function tableCount(bytes, offset) {
  slice(bytes, offset, 2);
  const count = bytes.readUInt16BE(offset);
  if (!count || count > 256) throw new Error("Font table count exceeds the review limit.");
  return count;
}

function base128(bytes, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index++) {
    const next = slice(bytes, cursor.offset++, 1)[0];
    if ((index === 0 && next === 0x80) || value > 0x1ffffff)
      throw new Error("Invalid WOFF2 UIntBase128 value.");
    value = value * 128 + (next & 0x7f);
    if (!(next & 0x80)) return value;
  }
  throw new Error("Invalid WOFF2 UIntBase128 value.");
}

function optionalBlocks(bytes, offset, decompress, dataEnd) {
  const metaOffset = bytes.readUInt32BE(offset);
  const metaLength = bytes.readUInt32BE(offset + 4);
  const metaOriginal = bytes.readUInt32BE(offset + 8);
  const privateOffset = bytes.readUInt32BE(offset + 12);
  const privateLength = bytes.readUInt32BE(offset + 16);
  let extendedMetadata = { present: false };
  let privateData = { present: false };
  if (metaOffset || metaLength || metaOriginal) {
    if (!metaOffset || !metaLength || !metaOriginal || metaOriginal > metadataLimit || metaOffset < dataEnd)
      throw new Error("Invalid font metadata block.");
    const decoded = decompress(slice(bytes, metaOffset, metaLength), { maxOutputLength: metadataLimit });
    if (decoded.length !== metaOriginal) throw new Error("Font metadata length does not match.");
    extendedMetadata = {
      present: true,
      bytes: decoded.length,
      sha256: sha256(decoded),
      text: new TextDecoder("utf-8", { fatal: true }).decode(decoded),
    };
  }
  if (privateOffset || privateLength) {
    if (!privateOffset || !privateLength || privateOffset < Math.max(dataEnd, metaOffset + metaLength))
      throw new Error("Invalid font private-data block.");
    const data = slice(bytes, privateOffset, privateLength);
    privateData = { present: true, bytes: data.length, sha256: sha256(data), scope: "Not interpreted." };
  }
  return { extendedMetadata, privateData };
}

function extractNameTable(bytes) {
  const signature = slice(bytes, 0, 4).toString("ascii");
  const tables = new Map();
  const add = (tag, data) => {
    if (tables.has(tag)) throw new Error("Duplicate font table.");
    tables.set(tag, data);
  };
  if (signature === "wOF2") {
    slice(bytes, 0, 48);
    if (bytes.readUInt32BE(4) === 0x74746366) throw new Error("Font collections are not supported.");
    if (bytes.readUInt32BE(8) !== bytes.length) throw new Error("Font file length does not match.");
    const count = tableCount(bytes, 12);
    const cursor = { offset: 48 };
    const records = [];
    let size = 0;
    for (let index = 0; index < count; index++) {
      const flags = slice(bytes, cursor.offset++, 1)[0];
      const tag = (flags & 63) === 63 ? slice(bytes, cursor.offset, 4).toString("ascii") : tags[flags & 63];
      if ((flags & 63) === 63) cursor.offset += 4;
      const version = flags >> 6;
      const glyph = tag === "glyf" || tag === "loca";
      if (!(glyph ? version === 0 || version === 3 : version === 0 || (tag === "hmtx" && version === 1)))
        throw new Error("Unknown WOFF2 table transformation.");
      const originalLength = base128(bytes, cursor);
      const transformed = glyph ? version !== 3 : version !== 0;
      const length = transformed ? base128(bytes, cursor) : originalLength;
      if (tag === "loca" && transformed && length !== 0)
        throw new Error("Invalid transformed WOFF2 loca length.");
      if (tag === "name" && transformed) throw new Error("Transformed name tables are not supported.");
      records.push({ tag, offset: size, length });
      size += length;
      if (size > limit) throw new Error("Font data exceeds the review limit.");
    }
    const compressedLength = bytes.readUInt32BE(20);
    const decoded = brotliDecompressSync(slice(bytes, cursor.offset, compressedLength), {
      maxOutputLength: limit,
    });
    if (decoded.length !== size) throw new Error("WOFF2 data length does not match the table directory.");
    for (const record of records) add(record.tag, slice(decoded, record.offset, record.length));
    return {
      format: "WOFF2",
      table: tables.get("name"),
      ...optionalBlocks(bytes, 28, brotliDecompressSync, cursor.offset + compressedLength),
    };
  }
  if (signature === "wOFF") {
    slice(bytes, 0, 44);
    if (bytes.readUInt32BE(8) !== bytes.length) throw new Error("Font file length does not match.");
    const count = tableCount(bytes, 12);
    if (bytes.readUInt32BE(4) === 0x74746366) throw new Error("Font collections are not supported.");
    const directoryEnd = 44 + count * 20;
    slice(bytes, 44, count * 20);
    let dataEnd = directoryEnd;
    let totalOriginal = 0;
    const ranges = [];
    for (let index = 0; index < count; index++) {
      const offset = 44 + index * 20;
      const tag = bytes.toString("ascii", offset, offset + 4);
      const tableOffset = bytes.readUInt32BE(offset + 4);
      const compressed = bytes.readUInt32BE(offset + 8);
      const original = bytes.readUInt32BE(offset + 12);
      totalOriginal += original;
      if (totalOriginal > limit) throw new Error("Font data exceeds the review limit.");
      if (tableOffset < directoryEnd || original > limit || compressed > original)
        throw new Error("Invalid WOFF table size or offset.");
      const data = slice(bytes, tableOffset, compressed);
      if (compressed && ranges.some(([start, end]) => tableOffset < end && tableOffset + compressed > start))
        throw new Error("Font table byte ranges overlap.");
      ranges.push([tableOffset, tableOffset + compressed]);
      const decoded = compressed < original ? inflateSync(data, { maxOutputLength: limit }) : data;
      if (decoded.length !== original) throw new Error("WOFF table length does not match.");
      add(tag, decoded);
      dataEnd = Math.max(dataEnd, tableOffset + compressed);
    }
    return { format: "WOFF", table: tables.get("name"), ...optionalBlocks(bytes, 24, inflateSync, dataEnd) };
  }
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(bytes.readUInt32BE(0)))
    throw new Error("Unsupported font format.");
  slice(bytes, 0, 12);
  const count = tableCount(bytes, 4);
  const directoryEnd = 12 + count * 16;
  slice(bytes, 12, count * 16);
  const ranges = [];
  for (let index = 0; index < count; index++) {
    const offset = 12 + index * 16;
    const tableOffset = bytes.readUInt32BE(offset + 8);
    const length = bytes.readUInt32BE(offset + 12);
    if (tableOffset < directoryEnd) throw new Error("Invalid SFNT table offset.");
    if (length && ranges.some(([start, end]) => tableOffset < end && tableOffset + length > start))
      throw new Error("Font table byte ranges overlap.");
    ranges.push([tableOffset, tableOffset + length]);
    add(bytes.toString("ascii", offset, offset + 4), slice(bytes, tableOffset, length));
  }
  return {
    format: "SFNT",
    table: tables.get("name"),
    extendedMetadata: { present: false },
    privateData: { present: false },
  };
}

export function inspectFontMetadata(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > limit)
    throw new Error("Font input exceeds the review limit.");
  const extracted = extractNameTable(bytes);
  if (!extracted.table) throw new Error("Font name table is absent.");
  const table = extracted.table;
  slice(table, 0, 6);
  const format = table.readUInt16BE(0);
  if (format !== 0 && format !== 1) throw new Error("Unsupported name table format.");
  const count = table.readUInt16BE(2);
  if (count > 4096) throw new Error("Name record count exceeds the review limit.");
  const stringOffset = table.readUInt16BE(4);
  let directoryEnd = 6 + count * 12;
  slice(table, 6, count * 12);
  if (format === 1) {
    slice(table, directoryEnd, 2);
    const languages = table.readUInt16BE(directoryEnd);
    slice(table, directoryEnd + 2, languages * 4);
    for (let index = 0; index < languages; index++) {
      const offset = directoryEnd + 2 + index * 4;
      slice(table, stringOffset + table.readUInt16BE(offset + 2), table.readUInt16BE(offset));
    }
    directoryEnd += 2 + languages * 4;
  }
  if (stringOffset < directoryEnd) throw new Error("Name strings overlap the record directory.");
  const records = [];
  let nameBytes = 0;
  for (let index = 0; index < count; index++) {
    const offset = 6 + index * 12;
    const platformID = table.readUInt16BE(offset);
    const encodingID = table.readUInt16BE(offset + 2);
    const data = slice(table, stringOffset + table.readUInt16BE(offset + 10), table.readUInt16BE(offset + 8));
    nameBytes += data.length;
    if (nameBytes > metadataLimit) throw new Error("Font name text exceeds the review limit.");
    const encoding =
      platformID === 0 || (platformID === 3 && [0, 1, 10].includes(encodingID))
        ? "utf-16be"
        : platformID === 1 && encodingID === 0
          ? "macintosh"
          : null;
    records.push({
      platformID,
      encodingID,
      languageID: table.readUInt16BE(offset + 4),
      nameID: table.readUInt16BE(offset + 6),
      encoding,
      text: encoding ? new TextDecoder(encoding, { fatal: true }).decode(data) : null,
      rawBase64: data.toString("base64"),
    });
  }
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    format: extracted.format,
    nameTable: { format, bytes: table.length, sha256: sha256(table), records },
    extendedMetadata: extracted.extendedMetadata,
    privateData: extracted.privateData,
    scope: "Name records and optional metadata blocks only. This is not a glyph validator or legal approval.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Use: node scripts/review-font-metadata.mjs <font-file>");
    const file = process.argv[2];
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > limit)
      throw new Error("Font input is not a bounded regular file.");
    console.log(JSON.stringify(inspectFontMetadata(fs.readFileSync(file)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
