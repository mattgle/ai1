import * as path from "node:path";

// Finds `name` as a file in one of the directories of `pathValue` (a `PATH`-
// style string, its entries separated by `path.delimiter`). `isExecutable`
// is injected so this function stays pure and testable without touching the
// real file system; the node code passes a check built on
// `fs.accessSync(candidate, fs.constants.X_OK)`.
export function findOnPath(
  name: string,
  pathValue: string | undefined,
  isExecutable: (candidate: string) => boolean,
): string | undefined {
  const directories = (pathValue ?? "").split(path.delimiter).filter((dir) => dir.length > 0);
  for (const dir of directories) {
    const candidate = path.join(dir, name);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
