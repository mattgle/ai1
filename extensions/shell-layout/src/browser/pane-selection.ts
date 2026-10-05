export interface PanePosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export function selectPanel(panes: readonly PanePosition[], index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined;
  const rows: PanePosition[][] = [];
  for (const pane of [...panes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((items) => Math.abs(items[0].y - pane.y) <= 3);
    if (row) row.push(pane);
    else rows.push([pane]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x))[index]?.id;
}
