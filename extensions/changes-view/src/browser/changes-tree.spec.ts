import * as assert from "node:assert";
import { RepoChanges } from "../common/changes-protocol";
import { buildRoot, FileNode, RepoNode } from "./changes-tree";

const repos: RepoChanges[] = [
  {
    name: "payments-api",
    rootUri: "file:///work/payments-api",
    branch: "feat/refunds",
    files: [
      { status: " M", path: "src/handler.ts" },
      { status: "??", path: "notes.md" },
    ],
  },
];

describe("buildRoot", () => {
  it("makes one repository node with one file node for each file", () => {
    const root = buildRoot(repos, () => undefined);
    const repo = root.children[0] as RepoNode;
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(repo.kind, "repo");
    assert.deepStrictEqual(
      repo.children.map((child) => (child as FileNode).entry.path),
      ["src/handler.ts", "notes.md"],
    );
  });

  it("gives stable ids, so that the tree keeps its state across a refresh", () => {
    const repo = buildRoot(repos, () => undefined).children[0] as RepoNode;
    assert.strictEqual(repo.id, "repo:file:///work/payments-api");
    assert.strictEqual(repo.children[0].id, "file:file:///work/payments-api:src/handler.ts");
  });

  it("expands a repository that is new", () => {
    const repo = buildRoot(repos, () => undefined).children[0] as RepoNode;
    assert.strictEqual(repo.expanded, true);
  });

  it("keeps a repository collapsed when the user collapsed it", () => {
    const repo = buildRoot(repos, (id) => (id === "repo:file:///work/payments-api" ? false : undefined))
      .children[0] as RepoNode;
    assert.strictEqual(repo.expanded, false);
  });

  it("links each node to its parent", () => {
    const root = buildRoot(repos, () => undefined);
    const repo = root.children[0] as RepoNode;
    assert.strictEqual(repo.parent, root);
    assert.strictEqual(repo.children[0].parent, repo);
  });

  it("gives a root with no children when nothing changed", () => {
    assert.strictEqual(buildRoot([], () => undefined).children.length, 0);
  });
});
