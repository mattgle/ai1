import * as assert from "node:assert";
import { shouldIgnorePath } from "./refresh-filter";

describe("shouldIgnorePath", () => {
  it("ignores paths inside folders that change all the time", () => {
    for (const folder of [".git", "node_modules", "dist", "out", "build", "coverage"]) {
      assert.strictEqual(shouldIgnorePath(`/work/repo/${folder}/file.js`), true, folder);
    }
  });

  it("ignores build state files, logs, and editor swap files", () => {
    for (const name of ["tsconfig.tsbuildinfo", "debug.log", ".index.ts.swp", ".index.ts.swo"]) {
      assert.strictEqual(shouldIgnorePath(`/work/repo/src/${name}`), true, name);
    }
  });

  it("ignores operating system files", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/.DS_Store"), true);
    assert.strictEqual(shouldIgnorePath("/work/repo/src/Thumbs.db"), true);
  });

  it("does not ignore a source file", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/index.ts"), false);
  });

  it("does not ignore a file whose name only contains an ignored folder name", () => {
    assert.strictEqual(shouldIgnorePath("/work/repo/src/distance.ts"), false);
  });
});
