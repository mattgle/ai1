import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { ChangesServiceImpl } from "./changes-service-impl";

// This is test data, not the owner's commit: it must not sign, so the test
// does not depend on the owner's desktop signing agent.
function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.name=AI1 Test", "-c", "user.email=test@ai1.invalid", ...args],
    { cwd },
  );
}

function createRepo(root: string, name: string): string {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "index.ts"), "export const value = 1;\n");
  fs.writeFileSync(path.join(repo, "old-name.ts"), "export const renamed = true;\n");
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "Initial commit");
  return repo;
}

const uriOf = (fsPath: string): string => pathToFileURL(fsPath).toString();

function createOutsideFolder(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-outside-")));
}

describe("ChangesServiceImpl", () => {
  const service = new ChangesServiceImpl();
  let root: string;
  let dirty: string;
  let outsideFolders: string[];

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-")));
    createRepo(root, "clean-repo");
    dirty = createRepo(root, "dirty-repo");
    fs.writeFileSync(path.join(dirty, "index.ts"), "export const value = 2;\n");
    fs.writeFileSync(path.join(dirty, "untracked.ts"), "export {};\n");
    outsideFolders = [];
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    for (const outsideFolder of outsideFolders) {
      fs.rmSync(outsideFolder, { recursive: true, force: true });
    }
  });

  it("returns only the repositories that have changes", async () => {
    const repos = await service.scan([uriOf(root)]);
    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["dirty-repo"],
    );
  });

  it("returns the branch and the changed files of a repository", async () => {
    const [repo] = await service.scan([uriOf(root)]);
    assert.strictEqual(repo.branch, "main");
    assert.deepStrictEqual(
      repo.files.map((file) => [file.status, file.path]),
      [
        [" M", "index.ts"],
        ["??", "untracked.ts"],
      ],
    );
  });

  it("gives an empty branch for a repository with no commits", async () => {
    const unborn = path.join(root, "unborn-repo");
    fs.mkdirSync(unborn, { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    fs.writeFileSync(path.join(unborn, "new.ts"), "export {};\n");

    const repos = await service.scan([uriOf(unborn)]);

    assert.strictEqual(repos[0].branch, "");
    assert.strictEqual(repos[0].detached, undefined);
  });

  it("gives an empty branch and detached: true for a detached head", async () => {
    git(dirty, "checkout", "--quiet", "--detach", "HEAD");

    const repos = await service.scan([uriOf(root)]);

    assert.strictEqual(repos[0].branch, "");
    assert.strictEqual(repos[0].detached, true);
  });

  it("finds a repository once, not twice, when a symbolic-link sibling points at it too", async () => {
    fs.symlinkSync(dirty, path.join(root, "linked-repo"));

    const repos = await service.scan([uriOf(root)]);

    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["dirty-repo"],
    );
  });

  it("finds a repository that is reachable only through a symbolic link, with no real sibling to prefer", async () => {
    const outsideFolder = createOutsideFolder();
    outsideFolders.push(outsideFolder);
    const outsideRepo = createRepo(outsideFolder, "outside-repo");
    fs.writeFileSync(path.join(outsideRepo, "index.ts"), "export const value = 3;\n");
    fs.symlinkSync(outsideRepo, path.join(root, "linked-only"));

    const repos = await service.scan([uriOf(root)]);

    assert.ok(repos.some((repo) => repo.name === "linked-only"));
  });

  it("prefers the real name over a link name when the workspace root itself is reached through a link, unresolved", async () => {
    // The workspace root URI is built from `linkToContents`, a symbolic link,
    // and is never passed through `fs.realpathSync`: this is the exact
    // situation the M2 fix's own realpath comparison could not handle, since
    // macOS resolves `/tmp` and `/var` through a link the same way, and no
    // candidate's own path then equals its realpath.
    const container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-changes-unresolved-")));
    outsideFolders.push(container);
    const contents = path.join(container, "contents");
    fs.mkdirSync(contents, { recursive: true });
    // "aaa-" sorts before "zzz-", so a directory listing that returns names
    // in that order reaches the link before the real repository.
    const realRepo = createRepo(contents, "zzz-real-repo");
    fs.writeFileSync(path.join(realRepo, "index.ts"), "export const value = 9;\n");
    fs.symlinkSync(realRepo, path.join(contents, "aaa-link-repo"));
    const linkToContents = path.join(container, "link-to-contents");
    fs.symlinkSync(contents, linkToContents);

    const repos = await service.scan([uriOf(linkToContents)]);

    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["zzz-real-repo"],
    );
  });

  it("treats a workspace root that is a repository as one repository", async () => {
    const repos = await service.scan([uriOf(dirty)]);
    assert.deepStrictEqual(
      repos.map((repo) => repo.name),
      ["dirty-repo"],
    );
  });

  it("reads the content of a file at HEAD", async () => {
    assert.strictEqual(await service.readHead(uriOf(dirty), "index.ts"), "export const value = 1;\n");
  });

  it("returns an empty string for a file that HEAD does not have", async () => {
    assert.strictEqual(await service.readHead(uriOf(dirty), "untracked.ts"), "");
  });

  it("restores a modified file", async () => {
    await service.discardFile(uriOf(dirty), { status: " M", path: "index.ts" });
    assert.strictEqual(fs.readFileSync(path.join(dirty, "index.ts"), "utf8"), "export const value = 1;\n");
  });

  it("deletes an untracked file", async () => {
    await service.discardFile(uriOf(dirty), { status: "??", path: "untracked.ts" });
    assert.strictEqual(fs.existsSync(path.join(dirty, "untracked.ts")), false);
  });

  it("removes a staged new file, which has no HEAD version to restore", async () => {
    const staged = path.join(dirty, "staged-new.ts");
    fs.writeFileSync(staged, "export {};\n");
    git(dirty, "add", "staged-new.ts");

    await service.discardFile(uriOf(dirty), { status: "A ", path: "staged-new.ts" });

    assert.strictEqual(fs.existsSync(staged), false);
  });

  it("removes a staged new file in a repository with no commits, where HEAD does not resolve", async () => {
    const unborn = path.join(root, "unborn-discard-repo");
    fs.mkdirSync(unborn, { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    const staged = path.join(unborn, "new.ts");
    fs.writeFileSync(staged, "export {};\n");
    git(unborn, "add", "new.ts");

    await service.discardFile(uriOf(unborn), { status: "A ", path: "new.ts" });

    assert.strictEqual(fs.existsSync(staged), false);
    assert.deepStrictEqual(await service.scan([uriOf(unborn)]), []);
  });

  it("removes a staged new file that was modified again (AM), in a repository with no commits", async () => {
    const unborn = path.join(root, "unborn-am-repo");
    fs.mkdirSync(unborn, { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    const staged = path.join(unborn, "new.ts");
    fs.writeFileSync(staged, "v1\n");
    git(unborn, "add", "new.ts");
    fs.writeFileSync(staged, "v2\n");

    await service.discardFile(uriOf(unborn), { status: "AM", path: "new.ts" });

    assert.strictEqual(fs.existsSync(staged), false);
    assert.deepStrictEqual(await service.scan([uriOf(unborn)]), []);
  });

  it("removes a staged new file that was deleted again (AD), in a repository with no commits", async () => {
    const unborn = path.join(root, "unborn-ad-repo");
    fs.mkdirSync(unborn, { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    const staged = path.join(unborn, "new.ts");
    fs.writeFileSync(staged, "v1\n");
    git(unborn, "add", "new.ts");
    fs.rmSync(staged);

    await service.discardFile(uriOf(unborn), { status: "AD", path: "new.ts" });

    assert.strictEqual(fs.existsSync(staged), false);
    assert.deepStrictEqual(await service.scan([uriOf(unborn)]), []);
  });

  it("removes a staged new file (AD) whose whole containing folder is also gone, in a repository with no commits", async () => {
    const unborn = path.join(root, "unborn-ad-subfolder-repo");
    fs.mkdirSync(path.join(unborn, "sub"), { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    const staged = path.join(unborn, "sub", "n.ts");
    fs.writeFileSync(staged, "export {};\n");
    git(unborn, "add", "sub/n.ts");
    fs.rmSync(path.join(unborn, "sub"), { recursive: true });

    await service.discardFile(uriOf(unborn), { status: "AD", path: "sub/n.ts" });

    assert.strictEqual(fs.existsSync(staged), false);
    assert.deepStrictEqual(await service.scan([uriOf(unborn)]), []);
  });

  it("resolves a real modify/delete conflict (DU): the file is gone and the row is clean", async () => {
    const conflictRepo = path.join(root, "du-conflict-repo");
    fs.mkdirSync(conflictRepo, { recursive: true });
    git(conflictRepo, "init", "--quiet", "--initial-branch=main");
    fs.writeFileSync(path.join(conflictRepo, "f.txt"), "base\n");
    git(conflictRepo, "add", "f.txt");
    git(conflictRepo, "commit", "--quiet", "-m", "base");
    git(conflictRepo, "branch", "--quiet", "deleter");
    git(conflictRepo, "branch", "--quiet", "modifier");
    git(conflictRepo, "checkout", "--quiet", "deleter");
    git(conflictRepo, "rm", "--quiet", "f.txt");
    git(conflictRepo, "commit", "--quiet", "-m", "delete");
    git(conflictRepo, "checkout", "--quiet", "modifier");
    fs.writeFileSync(path.join(conflictRepo, "f.txt"), "modified\n");
    git(conflictRepo, "commit", "--quiet", "-a", "-m", "modify");
    git(conflictRepo, "checkout", "--quiet", "deleter");
    try {
      git(conflictRepo, "merge", "--no-ff", "--quiet", "modifier");
    } catch {
      // The merge conflict is exactly what this test builds.
    }
    const [repo] = await service.scan([uriOf(conflictRepo)]);
    const conflicted = repo.files.find((file) => file.path === "f.txt");
    assert.ok(conflicted, "the scan reports the conflicted file");
    assert.strictEqual(conflicted.status, "DU");

    await service.discardFile(uriOf(conflictRepo), conflicted);

    assert.strictEqual(fs.existsSync(path.join(conflictRepo, "f.txt")), false);
    assert.deepStrictEqual(await service.scan([uriOf(conflictRepo)]), []);
  });

  it("finds an untracked file whose name has a quote and a space, and discards it", async () => {
    const weird = 'we "ird".ts';
    fs.writeFileSync(path.join(dirty, weird), "export {};\n");

    const [repo] = await service.scan([uriOf(root)]);
    const found = repo.files.find((file) => file.path === weird);
    assert.ok(found, "the scan reports the file with its exact path");

    await service.discardFile(uriOf(dirty), found);
    assert.strictEqual(fs.existsSync(path.join(dirty, weird)), false);
  });

  it("undoes a staged rename", async () => {
    git(dirty, "mv", "old-name.ts", "new-name.ts");
    const [repo] = await service.scan([uriOf(root)]);
    const rename = repo.files.find((file) => file.sourcePath === "old-name.ts");
    assert.ok(rename, "the scan reports the rename");
    await service.discardFile(uriOf(dirty), rename);
    assert.strictEqual(fs.existsSync(path.join(dirty, "old-name.ts")), true);
    assert.strictEqual(fs.existsSync(path.join(dirty, "new-name.ts")), false);
  });

  it("restores a rename detected by 'git add -N', where R is in the second status column", async () => {
    fs.renameSync(path.join(dirty, "old-name.ts"), path.join(dirty, "renamed-by-add-n.ts"));
    git(dirty, "add", "-N", "renamed-by-add-n.ts");

    const [repo] = await service.scan([uriOf(root)]);
    const rename = repo.files.find((file) => file.sourcePath === "old-name.ts");
    assert.ok(rename, "the scan reports the rename");
    assert.strictEqual(rename.status.charAt(1), "R", "R is in the second status column");

    await service.discardFile(uriOf(dirty), rename);

    assert.strictEqual(fs.existsSync(path.join(dirty, "old-name.ts")), true);
    assert.strictEqual(fs.existsSync(path.join(dirty, "renamed-by-add-n.ts")), false);
  });

  it("discards all changes of a repository and keeps ignored paths", async () => {
    fs.writeFileSync(path.join(dirty, ".gitignore"), "kept/\n");
    git(dirty, "add", ".gitignore");
    git(dirty, "commit", "--quiet", "-m", "Ignore the kept folder");
    fs.mkdirSync(path.join(dirty, "kept"));
    fs.writeFileSync(path.join(dirty, "kept", "cache.txt"), "stays\n");

    await service.discardAll(uriOf(dirty));

    assert.deepStrictEqual(await service.scan([uriOf(root)]), []);
    assert.strictEqual(fs.existsSync(path.join(dirty, "kept", "cache.txt")), true);
  });

  it("rejects with the git error text when a discard fails", async () => {
    await assert.rejects(
      service.discardFile(uriOf(dirty), { status: " M", path: "does-not-exist.ts" }),
      /does-not-exist/,
    );
  });

  it("rejects a discard path that leaves the repository through ..", async () => {
    const outsideFile = path.join(root, "outside.txt");
    fs.writeFileSync(outsideFile, "safe\n");

    await assert.rejects(
      service.discardFile(uriOf(dirty), { status: "??", path: "../outside.txt" }),
      /outside the repository/,
    );

    assert.strictEqual(fs.existsSync(outsideFile), true);
  });

  it("rejects a discard path that is absolute and outside the repository", async () => {
    const outsideFolder = createOutsideFolder();
    outsideFolders.push(outsideFolder);
    const victim = path.join(outsideFolder, "victim.txt");
    fs.writeFileSync(victim, "safe\n");

    await assert.rejects(
      service.discardFile(uriOf(dirty), { status: "??", path: victim }),
      /outside the repository/,
    );

    assert.strictEqual(fs.existsSync(victim), true);
  });

  it("rejects a discard path that leaves the repository through a symbolic link", async () => {
    const outsideFolder = createOutsideFolder();
    outsideFolders.push(outsideFolder);
    const victim = path.join(outsideFolder, "victim.txt");
    fs.writeFileSync(victim, "safe\n");
    fs.symlinkSync(outsideFolder, path.join(dirty, "link"));

    await assert.rejects(
      service.discardFile(uriOf(dirty), { status: "??", path: "link/victim.txt" }),
      /outside the repository/,
    );

    assert.strictEqual(fs.existsSync(victim), true);
  });

  it("restores only the named file when its path has glob characters", async () => {
    fs.mkdirSync(path.join(dirty, "app", "i"), { recursive: true });
    fs.mkdirSync(path.join(dirty, "app", "[id]"), { recursive: true });
    fs.writeFileSync(path.join(dirty, "app", "i", "page.ts"), "one\n");
    fs.writeFileSync(path.join(dirty, "app", "[id]", "page.ts"), "two\n");
    git(dirty, "add", "app");
    git(dirty, "commit", "--quiet", "-m", "Add the routes");
    fs.writeFileSync(path.join(dirty, "app", "i", "page.ts"), "one, edited\n");
    fs.writeFileSync(path.join(dirty, "app", "[id]", "page.ts"), "two, edited\n");

    await service.discardFile(uriOf(dirty), { status: " M", path: "app/[id]/page.ts" });

    assert.strictEqual(fs.readFileSync(path.join(dirty, "app", "[id]", "page.ts"), "utf8"), "two\n");
    assert.strictEqual(fs.readFileSync(path.join(dirty, "app", "i", "page.ts"), "utf8"), "one, edited\n");
  });

  it("deletes only the named staged new file when its name is a glob", async () => {
    fs.writeFileSync(path.join(dirty, "a1.ts"), "one\n");
    git(dirty, "add", "a1.ts");
    git(dirty, "commit", "--quiet", "-m", "Add a1");
    fs.writeFileSync(path.join(dirty, "a1.ts"), "one, edited\n");
    fs.writeFileSync(path.join(dirty, "a*.ts"), "new\n");
    git(dirty, "add", "--", "a*.ts");

    await service.discardFile(uriOf(dirty), { status: "A ", path: "a*.ts" });

    assert.strictEqual(fs.existsSync(path.join(dirty, "a*.ts")), false);
    assert.strictEqual(fs.readFileSync(path.join(dirty, "a1.ts"), "utf8"), "one, edited\n");
  });

  it("unstages only the named file in a repository with no commits when its name is a glob", async () => {
    const unborn = path.join(root, "unborn-glob-repo");
    fs.mkdirSync(unborn, { recursive: true });
    git(unborn, "init", "--quiet", "--initial-branch=main");
    fs.writeFileSync(path.join(unborn, "a1.ts"), "one\n");
    fs.writeFileSync(path.join(unborn, "a*.ts"), "new\n");
    git(unborn, "add", ".");

    await service.discardFile(uriOf(unborn), { status: "A ", path: "a*.ts" });

    assert.strictEqual(fs.existsSync(path.join(unborn, "a*.ts")), false);
    assert.strictEqual(fs.existsSync(path.join(unborn, "a1.ts")), true);
    const staged = execFileSync("git", ["-C", unborn, "diff", "--cached", "--name-only"], {
      encoding: "utf8",
    });
    assert.strictEqual(staged.trim(), "a1.ts");
  });
});
