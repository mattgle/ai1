export function relativeAge(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function cardThirdLine(messageCount: number, updatedAt: number, model: string, now: number): string {
  return `${messageCount} msgs · ${relativeAge(updatedAt, now)} · ${model}`;
}

export function oneLine(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

// The text shown at the top of the Agents view while the event stream is
// down. One function, used by the widget's own summary line above the tree
// and by its "no sessions" empty state, so the two can never disagree about
// when to show it -- the empty state used to skip it, hiding the
// reconnecting state whenever the workspace has no session to show yet.
export function reconnectingPrefix(connected: boolean): string {
  return connected ? "" : "Reconnecting… ";
}
