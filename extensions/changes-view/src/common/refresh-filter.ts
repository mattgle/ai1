const IGNORED_FOLDERS = ["/.git/", "/node_modules/", "/dist/", "/out/", "/build/", "/coverage/"];
const IGNORED_EXTENSIONS = [".tsbuildinfo", ".log", ".swp", ".swo"];
const IGNORED_NAMES = ["/.DS_Store", "/Thumbs.db"];

// Returns true for a path that changes often and does not change the output of
// `git status`: git internals, installed dependencies, build outputs, logs,
// editor swap files, and operating system files. A change of such a path must
// not start a refresh of the Changes view.
export function shouldIgnorePath(fsPath: string): boolean {
  return (
    IGNORED_FOLDERS.some((folder) => fsPath.includes(folder)) ||
    IGNORED_EXTENSIONS.some((extension) => fsPath.endsWith(extension)) ||
    IGNORED_NAMES.some((name) => fsPath.endsWith(name))
  );
}
