export type OpenLinksIn = "ask" | "ai1" | "system";

// Shift with the click opens the other browser for that click. Without a
// choice yet, AI1 still asks.
export function decideLinkTarget(setting: OpenLinksIn, shift: boolean): OpenLinksIn {
  if (!shift || setting === "ask") {
    return setting;
  }
  return setting === "ai1" ? "system" : "ai1";
}
