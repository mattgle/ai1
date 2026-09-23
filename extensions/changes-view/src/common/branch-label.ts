import { RepoChanges } from "./changes-protocol";

// The text a repository row shows next to its name: the branch name, or a
// placeholder for the two cases where `branch` is empty — a detached HEAD
// and a repository with no commits yet.
export function branchLabel(repo: Pick<RepoChanges, "branch" | "detached">): string {
  if (repo.branch) {
    return repo.branch;
  }
  return repo.detached ? "(detached)" : "(no commits)";
}
