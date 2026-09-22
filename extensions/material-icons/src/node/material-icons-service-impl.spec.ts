import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MATERIAL_ICONS_DIR_ENV } from "../common/material-icons-protocol";
import { MaterialIconsServiceImpl } from "./material-icons-service-impl";

describe("MaterialIconsServiceImpl", () => {
  const service = new MaterialIconsServiceImpl();
  let directory: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[MATERIAL_ICONS_DIR_ENV];
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-icons-"));
    fs.mkdirSync(path.join(directory, "dist"));
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[MATERIAL_ICONS_DIR_ENV];
    } else {
      process.env[MATERIAL_ICONS_DIR_ENV] = previous;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("returns the manifest from the icons folder", async () => {
    fs.writeFileSync(path.join(directory, "dist", "material-icons.json"), JSON.stringify({ file: "file" }));
    process.env[MATERIAL_ICONS_DIR_ENV] = directory;
    assert.deepStrictEqual(await service.getManifest(), { file: "file" });
  });

  it("rejects with the variable name when the icons folder is not set", async () => {
    delete process.env[MATERIAL_ICONS_DIR_ENV];
    await assert.rejects(service.getManifest(), new RegExp(MATERIAL_ICONS_DIR_ENV));
  });

  it("rejects when the manifest file does not exist", async () => {
    process.env[MATERIAL_ICONS_DIR_ENV] = directory;
    await assert.rejects(service.getManifest(), /material-icons\.json/);
  });
});
