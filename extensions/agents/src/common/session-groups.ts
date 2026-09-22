import { SessionGroup, SessionSummary } from "./agents-protocol";

export function repoName(directory: string): string {
  const trimmed = directory.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function isInside(directory: string, root: string): boolean {
  const base = root.replace(/\/+$/, "");
  return directory === base || directory.startsWith(`${base}/`);
}

// Groups the sessions by directory. Inside a group the newest session is
// first. The groups are ordered by their newest session.
export function groupSessions(sessions: SessionSummary[], workspaceRoots?: string[]): SessionGroup[] {
  const kept = workspaceRoots
    ? sessions.filter((session) => workspaceRoots.some((root) => isInside(session.directory, root)))
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
    groups.push({ directory, name: repoName(directory), sessions: list });
  }
  groups.sort((a, b) => b.sessions[0].updatedAt - a.sessions[0].updatedAt);
  return groups;
}
