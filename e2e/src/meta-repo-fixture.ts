import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=AI1 Test", "-c", "user.email=test@ai1.invalid", ...args], { cwd });
}

function createRepo(root: string, name: string): string {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "index.ts"), "export const value = 1;\n");
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "Initial commit");
  return repo;
}

// Makes a meta-repo in `root`: two sibling git repositories. `clean-repo` has
// no changes. `dirty-repo` has one changed file, `index.ts`.
export function createMetaRepoFixture(root: string): void {
  createRepo(root, "clean-repo");
  const dirty = createRepo(root, "dirty-repo");
  fs.writeFileSync(path.join(dirty, "index.ts"), "export const value = 2;\n");
}
