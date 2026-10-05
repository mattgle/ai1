import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { prepareLicenseAssets } from "./prepare-license-assets.mjs";

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-license-assets-"));
  try {
    const resources = path.join(root, "resources");
    fs.mkdirSync(resources);
    const bytes = Buffer.from("Upstream copyright\r\nLicense text\r\n");
    const source = {
      download: true,
      text: "reviewed/LICENSE.txt",
      revision: "a".repeat(40),
      url: `https://raw.githubusercontent.com/example/project/${"a".repeat(40)}/LICENSE`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const configFile = path.join(resources, "supplements.json");
    const prepare = async (request) => {
      fs.writeFileSync(configFile, JSON.stringify({ schemaVersion: 1, sources: { reviewed: source } }));
      return prepareLicenseAssets(configFile, request);
    };
    await run({ root, resources, bytes, source, prepare });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("pinned asset preparation preserves bytes and permits an offline cached build", async () => {
  await fixture(async ({ resources, bytes, prepare }) => {
    const results = await prepare(async (_url, options) => {
      assert.equal(options.redirect, "error");
      return { ok: true, arrayBuffer: async () => bytes };
    });
    assert.deepEqual(results, [{ id: "reviewed", downloaded: true }]);
    assert.deepEqual(fs.readFileSync(path.join(resources, "reviewed/LICENSE.txt")), bytes);
    assert.deepEqual(
      await prepare(() => {
        throw new Error("Network must not run");
      }),
      [{ id: "reviewed", downloaded: false }],
    );
  });
});

test("asset preparation rejects changed bytes without replacing existing files", async () => {
  await fixture(async ({ resources, prepare }) => {
    await assert.rejects(
      prepare(async () => ({ ok: true, arrayBuffer: async () => Buffer.from("Wrong bytes") })),
      /mismatch/,
    );
    fs.mkdirSync(path.join(resources, "reviewed"));
    fs.writeFileSync(path.join(resources, "reviewed/LICENSE.txt"), "User file");
    await assert.rejects(
      prepare(() => {
        throw new Error("Network must not run");
      }),
      /Existing license asset/,
    );
    assert.equal(fs.readFileSync(path.join(resources, "reviewed/LICENSE.txt"), "utf8"), "User file");
  });
});

test("asset preparation rejects unpinned URLs and escaping paths or parent links", async () => {
  for (const field of ["revision", "url", "text"])
    await fixture(async ({ source, prepare }) => {
      source[field] =
        field === "revision"
          ? "main"
          : field === "url"
            ? "https://example.invalid/LICENSE"
            : "../LICENSE.txt";
      await assert.rejects(
        prepare(() => {
          throw new Error("Network must not run");
        }),
        /Invalid pinned|escapes/,
      );
    });
  await fixture(async ({ root, resources, prepare }) => {
    fs.symlinkSync(root, path.join(resources, "reviewed"));
    await assert.rejects(
      prepare(() => {
        throw new Error("Network must not run");
      }),
      /parent escapes/,
    );
  });
});

test("asset preparation keeps dangling links unchanged without a network request", async () => {
  await fixture(async ({ root, resources, prepare }) => {
    fs.mkdirSync(path.join(resources, "reviewed"));
    const file = path.join(resources, "reviewed/LICENSE.txt");
    const target = path.join(root, "missing-license.txt");
    fs.symlinkSync(target, file);
    await assert.rejects(
      prepare(() => {
        throw new Error("Network must not run");
      }),
      /Existing license asset/,
    );
    assert.equal(fs.readlinkSync(file), target);
  });
});

test("asset preparation does not replace a file created during the request", async () => {
  await fixture(async ({ resources, bytes, prepare }) => {
    const folder = path.join(resources, "reviewed");
    const file = path.join(folder, "LICENSE.txt");
    await assert.rejects(
      prepare(async () => {
        fs.mkdirSync(folder);
        fs.writeFileSync(file, "User file");
        return { ok: true, arrayBuffer: async () => bytes };
      }),
      { code: "EEXIST" },
    );
    assert.equal(fs.readFileSync(file, "utf8"), "User file");
    assert.deepEqual(fs.readdirSync(folder), ["LICENSE.txt"]);
  });
});
