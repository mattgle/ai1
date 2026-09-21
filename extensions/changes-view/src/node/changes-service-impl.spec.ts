import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { ChangesServiceImpl } from "./changes-service-impl";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=AI1 Test", "-c", "user.email=test@ai1.invalid", ...args], { cwd });
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

  it("undoes a staged rename", async () => {
    git(dirty, "mv", "old-name.ts", "new-name.ts");
    const [repo] = await service.scan([uriOf(root)]);
    const rename = repo.files.find((file) => file.sourcePath === "old-name.ts");
    assert.ok(rename, "the scan reports the rename");
    await service.discardFile(uriOf(dirty), rename);
    assert.strictEqual(fs.existsSync(path.join(dirty, "old-name.ts")), true);
    assert.strictEqual(fs.existsSync(path.join(dirty, "new-name.ts")), false);
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
});
