import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { injectable } from "@theia/core/shared/inversify";
import { ChangesService, FileChangeEntry, RepoChanges } from "../common/changes-protocol";
import { discardPlan, parseStatusOutput } from "../common/git-status";
import { readGit, runGit } from "./git-runner";

interface RepoCandidate {
  name: string;
  path: string;
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
      await fs.promises.unlink(path.join(repoPath, plan.path));
    } else {
      await runGit(repoPath, plan.args);
    }
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
    return entries
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, ".git")))
      .map((entry) => ({ name: entry.name, path: path.join(root, entry.name) }));
  }

  protected async scanRepo(candidate: RepoCandidate): Promise<RepoChanges | undefined> {
    // --untracked-files=all lists each untracked file, not only its folder.
    const files = parseStatusOutput(
      await readGit(candidate.path, ["status", "--porcelain", "--untracked-files=all"]),
    );
    if (files.length === 0) {
      return undefined;
    }
    const branch = (await readGit(candidate.path, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return { name: candidate.name, rootUri: pathToFileURL(candidate.path).toString(), branch, files };
  }
}
