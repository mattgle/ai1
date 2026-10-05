export function parseTerminalFontSize(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
  const size = Number(text);
  return Number.isFinite(size) && size >= 6 ? size : undefined;
}
