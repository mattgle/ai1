import * as assert from "node:assert";
import * as fs from "node:fs";
import { resolveIconId } from "./material-icon-resolver";
import { MaterialIconManifest } from "./material-icons-protocol";

const manifest: MaterialIconManifest = {
  iconDefinitions: {},
  fileNames: { "package.json": "nodejs" },
  fileExtensions: { ts: "typescript", "spec.ts": "test-ts" },
  folderNames: { src: "folder-src" },
  folderNamesExpanded: { src: "folder-src-open" },
  file: "file",
  folder: "folder",
  folderExpanded: "folder-open",
};

describe("resolveIconId", () => {
  it("uses the file name before the extension", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "package.json", kind: "file", expanded: false }),
      "nodejs",
    );
  });

  it("uses the longest extension that matches", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "app.spec.ts", kind: "file", expanded: false }),
      "test-ts",
    );
  });

  it("uses a shorter extension when the longest one does not match", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "app.view.ts", kind: "file", expanded: false }),
      "typescript",
    );
  });

  it("ignores the case of the name", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "Index.TS", kind: "file", expanded: false }),
      "typescript",
    );
  });

  it("uses the default file icon when nothing matches", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "notes.unknown", kind: "file", expanded: false }),
      "file",
    );
  });

  it("uses the default file icon for a name with no extension", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "LICENSE", kind: "file", expanded: false }), "file");
  });

  it("uses the folder name", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "src", kind: "folder", expanded: false }),
      "folder-src",
    );
  });

  it("uses the expanded folder name for an expanded folder", () => {
    assert.strictEqual(
      resolveIconId(manifest, { name: "src", kind: "folder", expanded: true }),
      "folder-src-open",
    );
  });

  it("uses the default folder icons when the folder name does not match", () => {
    assert.strictEqual(resolveIconId(manifest, { name: "stuff", kind: "folder", expanded: false }), "folder");
    assert.strictEqual(
      resolveIconId(manifest, { name: "stuff", kind: "folder", expanded: true }),
      "folder-open",
    );
  });
});

describe("resolveIconId with the manifest of the material-icon-theme package", () => {
  const real: MaterialIconManifest = JSON.parse(
    fs.readFileSync(require.resolve("material-icon-theme/dist/material-icons.json"), "utf8"),
  );

  it("finds an icon definition for a TypeScript file", () => {
    const id = resolveIconId(real, { name: "index.ts", kind: "file", expanded: false });
    assert.strictEqual(id, "typescript");
    assert.ok(real.iconDefinitions[id]);
  });

  it("finds an icon definition for each default", () => {
    for (const id of [real.file, real.folder, real.folderExpanded]) {
      assert.ok(real.iconDefinitions[id], `no icon definition for ${id}`);
    }
  });
});
