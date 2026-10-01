export interface PanePosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export function selectPane(
  panes: readonly PanePosition[],
  currentId: string | undefined,
  axis: "row" | "column",
  index: number,
): string | undefined {
  if (index < 0 || !Number.isInteger(index)) {
    return undefined;
  }
  const rows: PanePosition[][] = [];
  for (const pane of [...panes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((items) => Math.abs(items[0].y - pane.y) <= 3);
    if (row) {
      row.push(pane);
    } else {
      rows.push([pane]);
    }
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }
  const currentRow = rows.find((row) => row.some((pane) => pane.id === currentId)) ?? rows[0];
  if (axis === "column") {
    return currentRow?.[index]?.id;
  }
  const targetRow = rows[index];
  const column = Math.max(0, currentRow?.findIndex((pane) => pane.id === currentId) ?? 0);
  return targetRow?.[Math.min(column, targetRow.length - 1)]?.id;
}
