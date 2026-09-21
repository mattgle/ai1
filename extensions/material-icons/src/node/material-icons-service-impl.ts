import * as fs from "node:fs";
import * as path from "node:path";
import { injectable } from "@theia/core/shared/inversify";
import {
  MATERIAL_ICONS_DIR_ENV,
  MATERIAL_ICONS_MANIFEST_PATH,
  MaterialIconManifest,
  MaterialIconsService,
} from "../common/material-icons-protocol";

@injectable()
export class MaterialIconsServiceImpl implements MaterialIconsService {
  async getManifest(): Promise<MaterialIconManifest> {
    const directory = process.env[MATERIAL_ICONS_DIR_ENV];
    if (!directory) {
      throw new Error(`${MATERIAL_ICONS_DIR_ENV} is not set. The Material icons do not load.`);
    }
    const manifestPath = path.join(directory, MATERIAL_ICONS_MANIFEST_PATH);
    return JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as MaterialIconManifest;
  }
}
