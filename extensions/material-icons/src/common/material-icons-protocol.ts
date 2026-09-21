// The back end serves the icon files of the material-icon-theme package under this route.
export const MATERIAL_ICONS_ROUTE = "/ai1-material-icons";

// The Electron main script sets this variable to the folder that holds
// `dist/material-icons.json` and `icons/`.
export const MATERIAL_ICONS_DIR_ENV = "AI1_MATERIAL_ICONS_DIR";

export const MATERIAL_ICONS_MANIFEST_PATH = "dist/material-icons.json";

// The part of the VS Code icon theme format that AI1 uses.
export interface MaterialIconManifest {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
}

export const MATERIAL_ICONS_SERVICE_PATH = "/services/ai1-material-icons";

export const MaterialIconsService = Symbol("MaterialIconsService");

export interface MaterialIconsService {
  // Returns the icon theme manifest of the material-icon-theme package.
  getManifest(): Promise<MaterialIconManifest>;
}
