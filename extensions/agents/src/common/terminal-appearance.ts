export const TERMINAL_APPEARANCE = "ai1.terminal.appearance";
export const TERMINAL_COLOR_OVERRIDES = "ai1.terminal.colorOverrides";

export const GHOSTTY_COLORS = {
  background: "#262427",
  foreground: "#fcfcfa",
  cursor: "#fcfcfa",
  cursorAccent: "#000000",
  selectionBackground: "#fcfcfa",
  selectionForeground: "#262427",
  selectionInactiveBackground: "#fcfcfa",
  black: "#262427",
  red: "#ff666d",
  green: "#b3e03a",
  yellow: "#ffc739",
  blue: "#00cde8",
  magenta: "#a392e8",
  cyan: "#9deaf6",
  white: "#fcfcfa",
  brightBlack: "#545452",
  brightRed: "#ff7e83",
  brightGreen: "#bee55e",
  brightYellow: "#ffd05e",
  brightBlue: "#1bd5eb",
  brightMagenta: "#b0a3eb",
  brightCyan: "#acedf8",
  brightWhite: "#fcfcfa",
} as const;

export type TerminalColor = keyof typeof GHOSTTY_COLORS;

export function terminalColorOverrides(value: unknown): Partial<Record<TerminalColor, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Partial<Record<TerminalColor, string>> = {};
  for (const key of Object.keys(GHOSTTY_COLORS) as TerminalColor[]) {
    const color = (value as Record<string, unknown>)[key];
    if (typeof color === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) {
      result[key] = color;
    }
  }
  return result;
}
