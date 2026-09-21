import * as fs from "node:fs";
import * as path from "node:path";

// Gives the real path of a file in the repository. Rejects when the path
// leaves the repository: through `..`, an absolute path, or a symbolic link.
export async function resolveInsideRepo(repoPath: string, relativePath: string): Promise<string> {
  const repoReal = await fs.promises.realpath(repoPath);
  const target = path.resolve(repoReal, relativePath);
  // The file itself can be a symbolic link, and unlink removes only the link.
  // So the check uses the real path of the parent folder.
  const parentReal = await fs.promises.realpath(path.dirname(target));
  const targetReal = path.join(parentReal, path.basename(target));
  const relative = path.relative(repoReal, targetReal);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`The path "${relativePath}" is outside the repository.`);
  }
  return targetReal;
}
