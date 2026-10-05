export const REPOSITORY_SCAN_DEPTH = "ai1.changes.repositoryScanDepth";
export const ALL_REPOSITORY_LEVELS = -1;

export function normalizeScanDepth(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= ALL_REPOSITORY_LEVELS
    ? value
    : ALL_REPOSITORY_LEVELS;
}

export function parseScanDepth(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const depth = Number(text);
  return Number.isSafeInteger(depth) ? depth : undefined;
}

export function scanDepthLabel(depth: number): string {
  if (depth === ALL_REPOSITORY_LEVELS) return "All levels";
  if (depth === 0) return "Current folder only";
  if (depth === 1) return "Direct children";
  return `Depth ${depth}`;
}
