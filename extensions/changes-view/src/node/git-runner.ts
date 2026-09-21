import { execFile } from "node:child_process";

const MAX_BUFFER = 50 * 1024 * 1024;

// Runs a read-only git command. A failure gives an empty string: a folder that
// is not a repository, or a path that HEAD does not have, is a normal case.
export function readGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repoPath, ...args],
      { encoding: "utf8", maxBuffer: MAX_BUFFER },
      (error, stdout) => {
        resolve(error ? "" : stdout);
      },
    );
  });
}

// Runs a git command that changes the repository. A failure rejects with the
// text that git wrote, so that the user sees the real cause.
export function runGit(repoPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", repoPath, ...args], { encoding: "utf8" }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve();
      }
    });
  });
}
