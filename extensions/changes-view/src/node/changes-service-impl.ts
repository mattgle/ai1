import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesService, FileChangeEntry, RepoChanges } from "../common/changes-protocol";
import { discardPlan, parseStatusOutput } from "../common/git-status";
import { readGit, runGit } from "./git-runner";
import { resolveInsideRepo } from "./repo-path";

interface RepoCandidate {
  name: string;
  path: string;
  // Whether this candidate's own directory entry is a symbolic link, from
  // `Dirent.isSymbolicLink()`. Undefined for the "workspace root is itself a
  // repository" case, where there is no sibling to dedupe against.
  isLink?: boolean;
}

@injectable()
export class ChangesServiceImpl implements ChangesService {
  async scan(workspaceRootUris: string[]): Promise<RepoChanges[]> {
    const candidates = (
      await Promise.all(workspaceRootUris.map((uri) => this.findRepos(fileURLToPath(uri))))
    ).flat();
    // All repositories in parallel: the total time is the time of the slowest one.
    const scanned = await Promise.all(candidates.map((candidate) => this.scanRepo(candidate)));
    return scanned
      .filter((repo): repo is RepoChanges => repo !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async readHead(repoRootUri: string, filePath: string): Promise<string> {
    return readGit(fileURLToPath(repoRootUri), ["show", `HEAD:${filePath}`]);
  }

  async discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void> {
    const repoPath = fileURLToPath(repoRootUri);
    const plan = discardPlan(entry);
    if (plan.kind === "delete") {
      await fs.promises.unlink(await resolveInsideRepo(repoPath, plan.path));
      return;
    }
    // `restore --source=HEAD` cannot work in a repository with no commits
    // yet: HEAD does not resolve. A rename cannot occur there either, since
    // `git mv` needs an already-tracked file, so this only ever applies to a
    // staged new file. Unstage it and delete it, the same result as the
    // normal discard of a staged new file.
    //   - `-f`: without it, `git rm --cached` refuses a file whose staged
    //     content differs from both the working tree and HEAD (status `AM`).
    //     HEAD has no version to fall back to, so `-f` is always safe here.
    //   - `git rm --cached` runs first, and only against the index: it needs
    //     no path on disk, so it works even when the whole containing folder
    //     (not only the file, status `AD`) is already gone.
    //   - `resolveInsideRepo` is only called when the working file still
    //     exists. It calls `fs.promises.realpath` on the file's parent
    //     folder, which throws ENOENT when that folder does not exist —
    //     exactly the state a discard of this kind is trying to reach, not
    //     an error to report.
    if (!(await this.hasHead(repoPath))) {
      await runGit(repoPath, ["rm", "--cached", "-f", "--quiet", "--", entry.path]);
      const rawTarget = path.join(repoPath, entry.path);
      if (fs.existsSync(rawTarget)) {
        await fs.promises.rm(await resolveInsideRepo(repoPath, entry.path), { force: true });
      }
      return;
    }
    await runGit(repoPath, plan.args);
  }

  protected async hasHead(repoPath: string): Promise<boolean> {
    return (await readGit(repoPath, ["rev-parse", "--verify", "HEAD"])).trim().length > 0;
  }

  async discardAll(repoRootUri: string): Promise<void> {
    const repoPath = fileURLToPath(repoRootUri);
    await runGit(repoPath, ["reset", "--hard", "HEAD"]);
    // No `-x`: ignored paths such as node_modules stay. The removed set is then
    // the set of `??` rows, because the scan uses --untracked-files=all.
    await runGit(repoPath, ["clean", "-fd"]);
  }

  // A workspace root is one repository, or a folder whose direct children are repositories.
  protected async findRepos(root: string): Promise<RepoCandidate[]> {
    if (fs.existsSync(path.join(root, ".git"))) {
      return [{ name: path.basename(root), path: root }];
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    const candidates = (
      await Promise.all(
        entries.map(async (entry): Promise<RepoCandidate | undefined> => {
          const childPath = path.join(root, entry.name);
          const isLink = entry.isSymbolicLink();
          // Dirent.isDirectory() is false for a symbolic link, even one that
          // points at a directory, so a symbolic-link sibling repository needs
          // a stat that follows the link.
          const isDirectory = entry.isDirectory() || (isLink && (await this.statIsDirectory(childPath)));
          return isDirectory && fs.existsSync(path.join(childPath, ".git"))
            ? { name: entry.name, path: childPath, isLink }
            : undefined;
        }),
      )
    ).filter((candidate): candidate is RepoCandidate => candidate !== undefined);
    return this.dedupeByRealPath(candidates);
  }

  protected async statIsDirectory(childPath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(childPath)).isDirectory();
    } catch {
      // A broken symbolic link: not a repository.
      return false;
    }
  }

  // A symbolic-link sibling that points at another candidate in the same
  // folder is the same repository found twice. Keep the entry whose own
  // directory entry is not a link (the real name); if neither is (two links
  // to the same target), keep the first one found.
  //
  // This does not compare `candidate.path` with its resolved `realPath`: the
  // workspace root itself can be reached through a link that was never
  // resolved with `realpathSync` (on macOS, `/tmp` and `/var` are links), in
  // which case *no* candidate's own path ever equals its realpath, even the
  // real, non-link sibling. `isLink` comes straight from the `Dirent` of each
  // sibling, so it is correct regardless of how the root itself was reached.
  protected async dedupeByRealPath(candidates: RepoCandidate[]): Promise<RepoCandidate[]> {
    const kept = new Map<string, RepoCandidate>();
    for (const candidate of candidates) {
      const realPath = await fs.promises.realpath(candidate.path);
      const existing = kept.get(realPath);
      if (!existing || (existing.isLink && !candidate.isLink)) {
        kept.set(realPath, candidate);
      }
    }
    return [...kept.values()];
  }

  protected async scanRepo(candidate: RepoCandidate): Promise<RepoChanges | undefined> {
    // -c core.quotepath=off stops git from C-style quoting a path with a
    // quote, a space, or a non-ASCII byte. -z separates records with `\0`
    // instead of `\n`, so such a path never needs quoting or escaping.
    // --untracked-files=all lists each untracked file, not only its folder.
    const files = parseStatusOutput(
      await readGit(candidate.path, [
        "-c",
        "core.quotepath=off",
        "status",
        "--porcelain",
        "-z",
        "--untracked-files=all",
      ]),
    );
    if (files.length === 0) {
      return undefined;
    }
    const { branch, detached } = await this.readBranch(candidate.path);
    return {
      name: candidate.name,
      rootUri: pathToFileURL(candidate.path).toString(),
      branch,
      ...(detached ? { detached: true } : {}),
      files,
    };
  }

  // `git branch --show-current` is empty for a detached HEAD, but it gives
  // the branch name for a repository with no commits yet, because HEAD is
  // still a symbolic ref to that branch. So a detached HEAD and a repository
  // with no commits both need `git rev-parse --verify HEAD` to tell apart: it
  // fails only when there is no commit yet.
  protected async readBranch(repoPath: string): Promise<{ branch: string; detached: boolean }> {
    const current = (await readGit(repoPath, ["branch", "--show-current"])).trim();
    const hasCommit = (await readGit(repoPath, ["rev-parse", "--verify", "HEAD"])).trim().length > 0;
    if (!hasCommit) {
      return { branch: "", detached: false };
    }
    return { branch: current, detached: current === "" };
  }
}
