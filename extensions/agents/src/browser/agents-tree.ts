import { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode, TreeNode } from "@theia/core/lib/browser";
import { SessionGroup, SessionSummary } from "../common/agents-protocol";

export interface GroupNode extends CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode {
  kind: "group";
  group: SessionGroup;
  hiddenCount: number;
  children: SessionNode[];
}

export interface SessionNode extends CompositeTreeNode, SelectableTreeNode {
  kind: "session";
  session: SessionSummary;
  children: SessionNode[];
  depth: number;
  expanded?: boolean;
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
  revealSessionId?: string,
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
    const ordered = orderSessions(group.sessions, revealSessionId);
    const visible = ordered.slice(0, visiblePerGroup);
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
    const nodes = new Map<string, SessionNode>();
    for (const entry of visible) {
      const parent = (entry.parentId && nodes.get(entry.parentId)) || node;
      const sessionNode: SessionNode = {
        id: `${id}:${entry.session.id}`,
        kind: "session",
        name: entry.session.title,
        parent,
        session: entry.session,
        selected: false,
        children: [],
        depth: isSessionNode(parent) ? parent.depth + 1 : 0,
      };
      nodes.set(entry.session.id, sessionNode);
      parent.children.push(sessionNode);
    }
    for (const sessionNode of nodes.values()) {
      if (sessionNode.children.length > 0) sessionNode.expanded = savedExpanded(sessionNode.id) ?? true;
    }
    return node;
  });
  return root;
}

function orderSessions(
  sessions: SessionSummary[],
  revealId?: string,
): { session: SessionSummary; parentId?: string }[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const parents = new Map<string, string>();
  for (const session of sessions) {
    if (session.parentId && session.parentId !== session.id && byId.has(session.parentId))
      parents.set(session.id, session.parentId);
  }
  // Invalid cycles stay visible as separate rows.
  for (const session of sessions) {
    const path: string[] = [];
    let id: string | undefined = session.id;
    while (id) {
      const cycle = path.indexOf(id);
      if (cycle !== -1) {
        for (const member of path.slice(cycle)) parents.delete(member);
        break;
      }
      path.push(id);
      id = parents.get(id);
    }
  }
  const ranks = new Map<string, number>();
  sessions.forEach((session, index) => {
    let id: string | undefined = session.id;
    while (id) {
      ranks.set(id, Math.min(ranks.get(id) ?? index, session.id === revealId ? -1 : index));
      id = parents.get(id);
    }
  });
  const children = new Map<string | undefined, SessionSummary[]>();
  for (const session of sessions) {
    const parentId = parents.get(session.id);
    const list = children.get(parentId) ?? [];
    list.push(session);
    children.set(parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  const result: { session: SessionSummary; parentId?: string }[] = [];
  const visit = (parentId?: string): void => {
    for (const session of children.get(parentId) ?? []) {
      result.push({ session, parentId });
      visit(session.id);
    }
  };
  visit();
  return result;
}
