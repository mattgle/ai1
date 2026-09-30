import { SessionGroup, SessionSummary } from "./agents-protocol";

export function repoName(directory: string): string {
  const trimmed = directory.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

// Exported so a caller other than `groupSessions` -- `AgentsModel`'s own
// defence-in-depth check against a summary outside its workspace roots --
// can reuse the exact same rule.
export function isInside(directory: string, root: string): boolean {
  const base = root.replace(/\/+$/, "");
  return directory === base || directory.startsWith(`${base}/`);
}

// Workspace root groups come first. Other groups and their sessions use
// the most recent update first.
export function groupSessions(sessions: SessionSummary[], workspaceRoots?: string[]): SessionGroup[] {
  const roots = workspaceRoots?.map((root) => root.replace(/\/+$/, "") || "/");
  const kept = roots
    ? sessions.filter((session) => roots.some((root) => isInside(session.directory, root)))
    : sessions;
  const byDirectory = new Map<string, SessionSummary[]>();
  for (const session of kept) {
    const list = byDirectory.get(session.directory) ?? [];
    list.push(session);
    byDirectory.set(session.directory, list);
  }
  const groups: SessionGroup[] = [];
  for (const [directory, list] of byDirectory) {
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const root = roots
      ?.filter((candidate) => isInside(directory, candidate))
      .sort((a, b) => b.length - a.length)[0];
    const name = root
      ? root === "/"
        ? directory
        : `${repoName(root)}${directory.slice(root.length)}`
      : repoName(directory);
    groups.push({ directory, name, sessions: list });
  }
  groups.sort((a, b) => {
    const rootOrder = Number(!!roots?.includes(b.directory)) - Number(!!roots?.includes(a.directory));
    return rootOrder || b.sessions[0].updatedAt - a.sessions[0].updatedAt;
  });
  return groups;
}
