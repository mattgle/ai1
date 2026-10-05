import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesService, FileChangeEntry, RepoChanges } from "../common/changes-protocol";
import { discardPlan } from "../common/git-status";
import { parseStatusV2 } from "../common/status-v2";
import { IGNORED_DIRECTORY_NAMES } from "../common/refresh-filter";
import { normalizeScanDepth } from "../common/repository-scan-depth";
import { readGit, runGit } from "./git-runner";
import { resolveInsideRepo } from "./repo-path";

interface RepoCandidate {
  name: string;
  path: string;
  realPath?: string;
  // True when the repository entry is a symbolic link.
  isLink?: boolean;
}

const SCAN_CONCURRENCY = 8;

interface ScanState {
  candidates: RepoCandidate[];
  repos: Map<string, RepoChanges>;
}

function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

async function canonicalPath(file: string): Promise<string> {
  const real = await fs.promises.realpath(file).catch(() => undefined);
  if (real) return real;
  const parent = path.dirname(file);
  if (parent === file) return file;
  return path.join(await canonicalPath(parent), path.basename(file));
}

@injectable()
export class ChangesServiceImpl implements ChangesService {
  protected cachedScan?: { key: string; state: Promise<ScanState> };

  async scan(workspaceRootUris: string[], maxDepth?: number, changedUris?: string[]): Promise<RepoChanges[]> {
    const roots = workspaceRootUris.map((uri) => fileURLToPath(uri));
    const depth = normalizeScanDepth(maxDepth);
    const key = JSON.stringify([roots, depth]);
    const previous = this.cachedScan?.key === key ? this.cachedScan.state : undefined;
    const state = (previous?.catch(() => undefined) ?? Promise.resolve(undefined)).then(async (cached) => {
      const full = changedUris === undefined || changedUris === null || !cached;
      const candidates = full
        ? await this.dedupeByRealPath(
            (await Promise.all(roots.map((root) => this.findRepos(root, depth)))).flat(),
          )
        : cached.candidates;
      const repos = full ? new Map<string, RepoChanges>() : new Map(cached.repos);
      const paths = await Promise.all(
        (
          changedUris?.flatMap((uri) => {
            try {
              return [fileURLToPath(uri)];
            } catch {
              return [];
            }
          }) ?? []
        ).map(canonicalPath),
      );
      const affected = full
        ? candidates
        : candidates.filter((candidate) =>
            paths.some(
              (changed) =>
                containsPath(candidate.realPath ?? candidate.path, changed) ||
                containsPath(changed, candidate.realPath ?? candidate.path),
            ),
          );
      for (let offset = 0; offset < affected.length; offset += SCAN_CONCURRENCY) {
        const scanned = await Promise.all(
          affected
            .slice(offset, offset + SCAN_CONCURRENCY)
            .map(async (candidate) => ({ candidate, repo: await this.scanRepo(candidate) })),
        );
        for (const { candidate, repo } of scanned) {
          if (repo) repos.set(candidate.path, repo);
          else repos.delete(candidate.path);
        }
      }
      return { candidates, repos };
    });
    this.cachedScan = { key, state };
    return [...(await state).repos.values()].sort((a, b) => a.name.localeCompare(b.name));
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

  // Search each directory level, including folders inside a repository.
  protected async findRepos(root: string, maxDepth: number): Promise<RepoCandidate[]> {
    const pending = [{ directory: root, depth: 0 }];
    const candidates: RepoCandidate[] = [];
    let offset = 0;
    while (offset < pending.length) {
      const batch = pending.slice(offset, offset + SCAN_CONCURRENCY);
      offset += batch.length;
      const results = await Promise.all(
        batch.map(async ({ directory, depth }) => {
          const repos: RepoCandidate[] = [];
          const folders: typeof pending = [];
          const name = (repoPath: string): string =>
            path.relative(root, repoPath).split(path.sep).join("/") || path.basename(root);
          if (fs.existsSync(path.join(directory, ".git"))) {
            repos.push({ name: name(directory), path: directory });
          }
          if (maxDepth >= 0 && depth >= maxDepth) return { repos, folders };
          let entries: fs.Dirent[];
          try {
            entries = await fs.promises.readdir(directory, { withFileTypes: true });
          } catch {
            return { repos, folders };
          }
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
            const childPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              folders.push({ directory: childPath, depth: depth + 1 });
            } else if (
              entry.isSymbolicLink() &&
              (await this.statIsDirectory(childPath)) &&
              fs.existsSync(path.join(childPath, ".git"))
            ) {
              repos.push({ name: name(childPath), path: childPath, isLink: true });
            }
          }
          return { repos, folders };
        }),
      );
      for (const result of results) {
        candidates.push(...result.repos);
        pending.push(...result.folders);
      }
    }
    return candidates;
  }

  protected async statIsDirectory(childPath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(childPath)).isDirectory();
    } catch {
      // A broken symbolic link: not a repository.
      return false;
    }
  }

  // Repository links and overlapping workspace roots can produce duplicates.
  // Keep the entry that is not a link. Otherwise, keep the first entry.
  //
  // This does not compare `candidate.path` with its resolved `realPath`: the
  // workspace root itself can be reached through a link that was never
  // resolved with `realpathSync` (on macOS, `/tmp` and `/var` are links), in
  // which case *no* candidate's own path ever equals its realpath, even the
  // real, non-link entry. `isLink` comes from the repository directory entry,
  // so it is correct regardless of how the workspace root is reached.
  protected async dedupeByRealPath(candidates: RepoCandidate[]): Promise<RepoCandidate[]> {
    const kept = new Map<string, RepoCandidate>();
    for (const candidate of candidates) {
      const realPath = await fs.promises.realpath(candidate.path).catch(() => undefined);
      if (!realPath) continue;
      const existing = kept.get(realPath);
      if (!existing || (existing.isLink && !candidate.isLink)) {
        kept.set(realPath, { ...candidate, realPath });
      }
    }
    return [...kept.values()];
  }

  protected async scanRepo(candidate: RepoCandidate): Promise<RepoChanges | undefined> {
    // -c core.quotepath=off stops git from C-style quoting a path with a
    // quote, a space, or a non-ASCII byte. --porcelain=v2 --branch adds the
    // branch.oid and branch.head headers to the same call, so one call gives
    // both the changed files and the branch. -z separates records with `\0`
    // instead of `\n`, so such a path never needs quoting or escaping.
    // --untracked-files=all lists each untracked file, not only its folder.
    const { branch, detached, files } = parseStatusV2(
      await readGit(candidate.path, [
        "-c",
        "core.quotepath=off",
        "status",
        "--porcelain=v2",
        "--branch",
        "-z",
        "--untracked-files=all",
      ]),
    );
    if (files.length === 0) {
      return undefined;
    }
    return {
      name: candidate.name,
      rootUri: pathToFileURL(candidate.path).toString(),
      branch,
      ...(detached ? { detached: true } : {}),
      files,
    };
  }
}
