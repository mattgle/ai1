import { FileChangeEntry } from "./changes-protocol";

// Parses the output of `git -c core.quotepath=off status --porcelain=v2
// --branch -z --untracked-files=all`. With `-z`, records are separated by
// `\0` instead of `\n`, and `core.quotepath=off` stops git from C-style
// quoting a path that has a quote, a space, or a non-ASCII byte. This was
// checked against real repositories, including a rename, a copy, a path
// with a space, a quote, a newline, and a non-ASCII name, and all seven
// unmerged (conflict) status codes.
//
// Two headers give the branch:
//   `# branch.oid <commit>` — `(initial)` means the repository has no
//     commit yet. `branch.head` still gives the branch name then, because
//     HEAD is a symbolic ref to that branch, so `branch.head` alone does not
//     show a repository with no commits.
//   `# branch.head <branch>` — `(detached)` means HEAD is detached.
// Every other header (`# branch.upstream`, `# branch.ab`, `# stash`) and any
// header this parser does not know is skipped.
//
// Four record kinds follow the headers, each on its own `\0`-terminated
// record:
//   `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
//     an ordinary changed entry.
//   `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>` then a second
//     record that holds only the original path (the source of a rename, or
//     what a copy was copied from).
//   `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
//     an unmerged (conflict) entry.
//   `? <path>`
//     an untracked file.
// `! <path>` (an ignored file) is skipped: this service never passes
// `--ignored`, so it is not expected, but the parser still skips it, the
// same as any other record kind it does not know.
//
// Version 2 uses "." for the staged or the unstaged half of `<XY>` when that
// half is unchanged; version 1 used a space there instead, so this parser
// turns "." back into a space. This keeps the two-letter status code the
// rest of the service already expects, unchanged since before this parser:
// for example " M", "R " (and " R", which `git add -N` on a moved file
// reports, R in the second column), "C ". An unmerged entry's `<XY>` is
// never an "unchanged" half, so it is kept as-is, for example "AA", "UD".
export interface StatusV2 {
  branch: string;
  detached: boolean;
  files: FileChangeEntry[];
}

const BRANCH_OID_PREFIX = "# branch.oid ";
const BRANCH_HEAD_PREFIX = "# branch.head ";

function toStatusCode(xy: string): string {
  return xy.replace(/\./g, " ");
}

// Splits `count` space-separated fields off the front of `record`, and
// returns everything after the last one, untouched. The path field of a v2
// record is never split this way: a path can itself contain a space, so it
// is always what is left over after the fixed fields ahead of it are taken.
function takeFields(record: string, count: number): { fields: string[]; rest: string } {
  const fields: string[] = [];
  let rest = record;
  for (let i = 0; i < count; i += 1) {
    const spaceIndex = rest.indexOf(" ");
    fields.push(rest.slice(0, spaceIndex));
    rest = rest.slice(spaceIndex + 1);
  }
  return { fields, rest };
}

export function parseStatusV2(stdout: string): StatusV2 {
  const records = stdout.split("\0");
  const files: FileChangeEntry[] = [];
  let oid: string | undefined;
  let head: string | undefined;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length === 0) {
      continue;
    }
    if (record.startsWith(BRANCH_OID_PREFIX)) {
      oid = record.slice(BRANCH_OID_PREFIX.length);
      continue;
    }
    if (record.startsWith(BRANCH_HEAD_PREFIX)) {
      head = record.slice(BRANCH_HEAD_PREFIX.length);
      continue;
    }
    const kind = record.charAt(0);
    if (kind === "1") {
      const { fields, rest } = takeFields(record, 8);
      files.push({ status: toStatusCode(fields[1]), path: rest });
    } else if (kind === "2") {
      const { fields, rest } = takeFields(record, 9);
      index += 1;
      const origPath = records[index];
      const status = toStatusCode(fields[1]);
      files.push(
        status.includes("R")
          ? { status, path: rest, sourcePath: origPath }
          : { status, path: rest, copyOf: origPath },
      );
    } else if (kind === "u") {
      const { fields, rest } = takeFields(record, 10);
      files.push({ status: fields[1], path: rest });
    } else if (kind === "?") {
      files.push({ status: "??", path: record.slice(2) });
    }
    // "!" (ignored) and any other record kind this parser does not know: skipped.
  }
  const hasCommit = oid !== undefined && oid !== "(initial)";
  if (!hasCommit) {
    return { branch: "", detached: false, files: inVersion1Order(files) };
  }
  const detached = head === "(detached)";
  return { branch: detached ? "" : (head ?? ""), detached, files: inVersion1Order(files) };
}

// Version 2 lists the ordinary and rename entries first and the conflict
// entries after them. Version 1 gave all tracked entries, conflicts
// included, in path order, then the untracked entries. The view keeps the
// version 1 order. Code-unit order is the same as git's byte order for every
// path outside the Unicode surrogate range.
function inVersion1Order(files: FileChangeEntry[]): FileChangeEntry[] {
  const tracked = files.filter((file) => file.status !== "??");
  const untracked = files.filter((file) => file.status === "??");
  tracked.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return [...tracked, ...untracked];
}
