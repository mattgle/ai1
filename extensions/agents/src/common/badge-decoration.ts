export interface BadgeDecoration {
  badge: number;
}

// The pure rule behind `AgentsBadgeDecorator`. An empty list clears the
// badge; `WidgetDecoration.Data` (the browser type) accepts a plain
// `{ badge: number }` object, so the browser class returns this result as
// is.
export function badgeDecorations(blockedCount: number): BadgeDecoration[] {
  return blockedCount > 0 ? [{ badge: blockedCount }] : [];
}
