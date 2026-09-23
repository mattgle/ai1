// The value/tooltip pair that `BadgeService.showBadge` takes for the Agents
// tab. Structurally compatible with Theia's own `Badge` interface
// (`{ value: number; tooltip: string }`), without importing it here: this
// module stays free of Theia imports, like the rest of `src/common`.
export interface SessionBadge {
  value: number;
  tooltip: string;
}

// The pure rule behind the Agents tab's badge: no badge for zero blocked
// sessions, otherwise the count with a tooltip in the singular or plural.
export function sessionBadge(blockedCount: number): SessionBadge | undefined {
  if (blockedCount <= 0) {
    return undefined;
  }
  return { value: blockedCount, tooltip: `${blockedCount} blocked session${blockedCount === 1 ? "" : "s"}` };
}
