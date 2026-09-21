import { FileChangeEntry } from "./changes-protocol";

// Parses one line of `git status --porcelain`. Porcelain version 1 reports a
// rename as "R  old -> new".
function parseStatusLine(line: string): FileChangeEntry {
  const status = line.slice(0, 2);
  const filePart = line.slice(3);
  const arrow = filePart.indexOf(" -> ");
  if (arrow >= 0) {
    return { status, path: filePart.slice(arrow + 4), sourcePath: filePart.slice(0, arrow) };
  }
  return { status, path: filePart };
}

export function parseStatusOutput(stdout: string): FileChangeEntry[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 3)
    .map(parseStatusLine);
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

export type DiscardPlan = { kind: "delete"; path: string } | { kind: "git"; args: string[] };

// Selects how to discard the changes of one file.
//   - An untracked file has no HEAD version, so it is deleted.
//   - A rename restores the old path and removes the new path in one command.
//     `git checkout HEAD -- <new>` fails, because HEAD does not have the new path.
//   - Other tracked files reset the index and the working tree to HEAD.
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
  return { kind: "git", args: ["checkout", "HEAD", "--", entry.path] };
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
