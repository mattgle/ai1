import * as express from "@theia/core/shared/express";
import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node/backend-application";
import { MATERIAL_ICONS_DIR_ENV, MATERIAL_ICONS_ROUTE } from "../common/material-icons-protocol";

// Serves the manifest and the SVG files of the material-icon-theme package to the front end.
@injectable()
export class MaterialIconsBackendContribution implements BackendApplicationContribution {
  configure(app: express.Application): void {
    const directory = process.env[MATERIAL_ICONS_DIR_ENV];
    if (!directory) {
      console.warn(
        `ai1-material-icons: ${MATERIAL_ICONS_DIR_ENV} is not set. The Material icons do not load.`,
      );
      return;
    }
    app.use(MATERIAL_ICONS_ROUTE, express.static(directory, { maxAge: "1d" }));
  }
}
