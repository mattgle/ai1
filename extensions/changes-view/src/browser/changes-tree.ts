import type { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode } from "@theia/core/lib/browser/tree";
import { FileChangeEntry, RepoChanges } from "../common/changes-protocol";

export const CHANGES_ROOT_ID = "ai1-changes-root";

export interface RepoNode extends CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode {
  kind: "repo";
  repo: RepoChanges;
}

export interface FileNode extends SelectableTreeNode {
  kind: "file";
  repoRootUri: string;
  entry: FileChangeEntry;
}

export function isRepoNode(node: unknown): node is RepoNode {
  return typeof node === "object" && node !== null && (node as RepoNode).kind === "repo";
}

export function isFileNode(node: unknown): node is FileNode {
  return typeof node === "object" && node !== null && (node as FileNode).kind === "file";
}

// Builds the tree from the scan result. `wasExpanded` gives the state of a
// repository node in the tree that this one replaces: true, false, or
// undefined for a repository that is new. A new repository is expanded.
export function buildRoot(
  repos: RepoChanges[],
  wasExpanded: (nodeId: string) => boolean | undefined,
): CompositeTreeNode {
  const root: CompositeTreeNode = { id: CHANGES_ROOT_ID, parent: undefined, visible: false, children: [] };
  const repoNodes = repos.map((repo) => {
    const id = `repo:${repo.rootUri}`;
    const node: RepoNode = {
      id,
      kind: "repo",
      repo,
      parent: root,
      children: [],
      expanded: wasExpanded(id) ?? true,
      selected: false,
    };
    node.children = repo.files.map((entry): FileNode => ({
      id: `file:${repo.rootUri}:${entry.path}`,
      kind: "file",
      repoRootUri: repo.rootUri,
      entry,
      parent: node,
      selected: false,
    }));
    return node;
  });
  (root as { children: CompositeTreeNode["children"] }).children = repoNodes;
  return root;
}
