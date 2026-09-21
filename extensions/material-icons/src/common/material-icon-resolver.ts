import { MaterialIconManifest } from "./material-icons-protocol";

export interface IconTarget {
  // The base name of the file or the folder, with no path.
  name: string;
  kind: "file" | "folder";
  // Applies to folders only.
  expanded: boolean;
}

// Returns the id of the icon definition for a file or a folder. The order is
// the order of the VS Code icon theme format: file name, then the longest
// extension, then the default.
export function resolveIconId(manifest: MaterialIconManifest, target: IconTarget): string {
  const name = target.name.toLowerCase();
  if (target.kind === "folder") {
    return target.expanded
      ? (manifest.folderNamesExpanded[name] ?? manifest.folderExpanded)
      : (manifest.folderNames[name] ?? manifest.folder);
  }
  const byName = manifest.fileNames[name];
  if (byName) {
    return byName;
  }
  for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
    const byExtension = manifest.fileExtensions[name.slice(dot + 1)];
    if (byExtension) {
      return byExtension;
    }
  }
  return manifest.file;
}
