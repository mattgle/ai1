// A tab id stays the same for the life of a tab, also across a restart (it
// is part of the saved layout).
export function newTabId(now: number, counter: number): string {
  return `tab-${now.toString(36)}-${counter}`;
}
