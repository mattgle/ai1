import { FileChangeEntry } from "./changes-protocol";

// Parses the output of `git -c core.quotepath=off status --porcelain -z
// --untracked-files=all`. With `-z`, records are separated by `\0` instead of
// `\n`, and `core.quotepath=off` stops git from C-style quoting a path that
// has a quote, a space, or a non-ASCII byte. A rename or a copy reports two
// records: the status letters and the new path, then a second record that
// holds only the source path. `R` or `C` can be in either status column: for
// example `git add -N` on a moved file reports " R", not "R ". A copy needs
// `status.renames=copies` or `diff.renames=copies` in the user's git config;
// this service does not turn it on, but the parser still reads it correctly
// when the user's config does.
export function parseStatusOutput(stdout: string): FileChangeEntry[] {
  const records = stdout.split("\0");
  const entries: FileChangeEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length === 0) {
      continue;
    }
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (status.includes("R")) {
      index += 1;
      entries.push({ status, path, sourcePath: records[index] });
    } else if (status.includes("C")) {
      index += 1;
      entries.push({ status, path, copyOf: records[index] });
    } else {
      entries.push({ status, path });
    }
  }
  return entries;
}

// The one letter that a file row shows.
export function statusBadge(status: string): string {
  if (status === "??") {
    return "U";
  }
  const index = status.charAt(0);
  const workingTree = status.charAt(1);
  return index === " " ? workingTree || "?" : index || "?";
}

export function isUntracked(entry: FileChangeEntry): boolean {
  return entry.status === "??";
}

// A deleted file has no working file, so a diff editor cannot open it.
export function isDeleted(entry: FileChangeEntry): boolean {
  return entry.status.includes("D");
}

// Git's seven unmerged (conflict) status codes, and whether HEAD has a
// version of the path for each. Every one of the seven was built with a real
// merge conflict in an isolated temporary repository and checked directly
// (`git status --porcelain`, then `git show HEAD:<path>`): a rename/rename
// conflict gives `DD` for the original name and `AU`/`UA` for the two new
// names; a modify/delete conflict gives `UD` (deleted by them) and `DU`
// (deleted by us); an add/add conflict gives `AA`; a modify/modify conflict
// gives `UU`.
//
// HEAD has no version for `DD`, `DU`, and `UA`: our own side (HEAD) either
// deleted the path (`DD`, `DU`) or never had it at all (`UA` — only the
// other side added it). `AU`, `AA`, `UD`, and `UU` do have a HEAD version:
// our side added or kept its own content at that path.
const UNMERGED_HAS_HEAD_VERSION: Readonly<Record<string, boolean>> = {
  DD: false,
  AU: true,
  UD: true,
  UA: false,
  DU: false,
  AA: true,
  UU: true,
};

function isUnmerged(status: string): boolean {
  return status in UNMERGED_HAS_HEAD_VERSION;
}

export type DiscardPlan = { kind: "delete"; path: string } | { kind: "git"; args: string[] };

// Selects how to discard the changes of one file.
//   - An untracked file has no HEAD version, so it is deleted.
//   - A rename restores the old path and removes the new path in one command.
//   - An unmerged (conflict) path with no HEAD version (`DD`, `DU`, `UA`)
//     cannot use `restore --source=HEAD`: git rejects it with
//     "path '<path>' is unmerged". `git rm -f` resolves it instead — the
//     path is removed from the index and the working tree, and the merge
//     itself stays in progress for any other unresolved path.
//   - Every other tracked file, including the rest of the unmerged codes
//     (`AU`, `AA`, `UD`, `UU`, where HEAD does have a version), resets the
//     index and the working tree to HEAD with the same `restore` command. A
//     staged new file has no HEAD version either, and `restore` removes it,
//     the same way it removes the new path of a rename. `git checkout HEAD
//     -- <path>` fails for that file, because HEAD does not have the path.
export function discardPlan(entry: FileChangeEntry): DiscardPlan {
  if (isUntracked(entry)) {
    return { kind: "delete", path: entry.path };
  }
  if (entry.sourcePath) {
    return {
      kind: "git",
      args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", entry.sourcePath, entry.path],
    };
  }
  if (isUnmerged(entry.status) && !UNMERGED_HAS_HEAD_VERSION[entry.status]) {
    return { kind: "git", args: ["rm", "-f", "--quiet", "--", entry.path] };
  }
  return { kind: "git", args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", entry.path] };
}

export interface DiscardPrompt {
  title: string;
  msg: string;
  ok: string;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function discardPrompt(entry: FileChangeEntry): DiscardPrompt {
  if (isUntracked(entry)) {
    return {
      title: "Delete file",
      msg: `Delete '${baseName(entry.path)}'? You cannot undo this.`,
      ok: "Delete file",
    };
  }
  if (entry.sourcePath) {
    return {
      title: "Undo rename",
      msg: `Undo the rename ${entry.sourcePath} → ${entry.path}? The new file is removed and the original is restored. You cannot undo this.`,
      ok: "Undo rename",
    };
  }
  if (isUnmerged(entry.status)) {
    const name = baseName(entry.path);
    const removed = UNMERGED_HAS_HEAD_VERSION[entry.status]
      ? ""
      : " HEAD has no version of this file, so it is removed.";
    return {
      title: "Resolve conflict",
      msg: `Resolve '${name}' to its HEAD version?${removed} Your working copy and the index are replaced. You cannot undo this.`,
      ok: "Resolve to HEAD version",
    };
  }
  // A file added in either status column, or a copy, has no HEAD version at
  // its own path. Discarding it removes it, the same as an untracked file,
  // so the wording matches. This check comes after `isUnmerged`, so an
  // unmerged status that also contains an `A` (`AA`, `AU`, `UA`) is never
  // reached here.
  if (entry.status.includes("A") || entry.status.includes("C")) {
    return {
      title: "Delete file",
      msg: `Delete '${baseName(entry.path)}'? It has no earlier version to go back to. You cannot undo this.`,
      ok: "Delete file",
    };
  }
  return {
    title: "Discard changes",
    msg: `Discard the changes in '${baseName(entry.path)}'? You cannot undo this.`,
    ok: "Discard changes",
  };
}

export function discardAllPrompt(repoName: string, changeCount: number): DiscardPrompt {
  const changes = `${changeCount} change${changeCount === 1 ? "" : "s"}`;
  return {
    title: "Discard all changes",
    msg: `Discard all changes in '${repoName}'? ${changes} will be discarded: modified files are reset and untracked files are deleted. Ignored paths stay. You cannot undo this.`,
    ok: "Discard all changes",
  };
}
