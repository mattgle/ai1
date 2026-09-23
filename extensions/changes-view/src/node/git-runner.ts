import { execFile, ExecFileException } from "node:child_process";

const MAX_BUFFER = 50 * 1024 * 1024;
const DEFAULT_PROGRAM = "git";

// `program` is a parameter only so that a test can point at a program name
// that does not exist. Production code always uses the default, "git".

function isMissingProgram(error: ExecFileException | null): boolean {
  return error !== null && error.code === "ENOENT";
}

function missingProgramMessage(program: string): string {
  return `The "${program}" program is not found. Install git and make it available on the PATH.`;
}

// Runs a read-only git command. A git exit code gives an empty string: a
// folder that is not a repository, or a path that HEAD does not have, is a
// normal case. A missing git program rejects, because every later scan would
// fail the same way and the view must tell the user, not stay empty.
export function readGit(
  repoPath: string,
  args: string[],
  program: string = DEFAULT_PROGRAM,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      ["-C", repoPath, ...args],
      { encoding: "utf8", maxBuffer: MAX_BUFFER },
      (error, stdout) => {
        if (isMissingProgram(error)) {
          reject(new Error(missingProgramMessage(program)));
          return;
        }
        resolve(error ? "" : stdout);
      },
    );
  });
}

// Runs a git command that changes the repository. A failure rejects with the
// text that git wrote, so that the user sees the real cause. A missing git
// program rejects with the same message as `readGit`.
//
// `--literal-pathspecs`: git reads a path as a glob even after `--`, so a
// discard of `app/[id]/page.ts` would also discard `app/i/page.ts`. Every
// path given here names exactly one file.
export function runGit(repoPath: string, args: string[], program: string = DEFAULT_PROGRAM): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      ["--literal-pathspecs", "-C", repoPath, ...args],
      { encoding: "utf8" },
      (error, _stdout, stderr) => {
        if (isMissingProgram(error)) {
          reject(new Error(missingProgramMessage(program)));
          return;
        }
        if (error) {
          reject(new Error(stderr.trim() || error.message));
        } else {
          resolve();
        }
      },
    );
  });
}
