import { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode, TreeNode } from "@theia/core/lib/browser";
import { SessionGroup, SessionSummary } from "../common/agents-protocol";

export interface GroupNode extends CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode {
  kind: "group";
  group: SessionGroup;
  hiddenCount: number;
  children: SessionNode[];
}

export interface SessionNode extends SelectableTreeNode {
  kind: "session";
  session: SessionSummary;
}

export function isGroupNode(node: TreeNode | undefined): node is GroupNode {
  return !!node && (node as GroupNode).kind === "group";
}

export function isSessionNode(node: TreeNode | undefined): node is SessionNode {
  return !!node && (node as SessionNode).kind === "session";
}

const ROOT_ID = "ai1-agents";

// Builds the tree. The ids are stable across a refresh, so the expanded
// state survives. A group with a working or blocked session starts expanded.
export function buildRoot(
  groups: SessionGroup[],
  savedExpanded: (id: string) => boolean | undefined,
  visiblePerGroup: number,
): CompositeTreeNode {
  const root: CompositeTreeNode = {
    id: ROOT_ID,
    name: "Agents",
    parent: undefined,
    visible: false,
    children: [],
  };
  root.children = groups.map((group) => {
    const id = `${ROOT_ID}:${group.directory}`;
    const attention = group.sessions.some((s) => s.status === "working" || s.status === "blocked");
    const node: GroupNode = {
      id,
      kind: "group",
      name: group.name,
      parent: root,
      group,
      expanded: savedExpanded(id) ?? attention,
      selected: false,
      hiddenCount: Math.max(0, group.sessions.length - visiblePerGroup),
      children: [],
    };
    node.children = group.sessions.slice(0, visiblePerGroup).map((session) => ({
      id: `${id}:${session.id}`,
      kind: "session",
      name: session.title,
      parent: node,
      session,
      selected: false,
    }));
    return node;
  });
  return root;
}
