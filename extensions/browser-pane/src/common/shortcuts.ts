// The browser shortcuts that the main process catches on an AI1 page and
// that the front end registers as Theia keybindings.
export type BrowserShortcut =
  | "find"
  | "findNext"
  | "findPrevious"
  | "closeFind"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "reopenClosedTab"
  | "newTerminal"
  | "toggleExplorer"
  | "focusAddress";

// The parts of an Electron `Input` (from `before-input-event`) that the
// shortcut list uses.
export interface ShortcutInput {
  type: string;
  key: string;
  meta: boolean;
  control: boolean;
  shift: boolean;
  alt: boolean;
}

// The shortcut of a key input, or `undefined` for a key that the page must
// get. Escape is a shortcut only while the find bar is open.
export function shortcutFor(
  input: ShortcutInput,
  findOpen: boolean,
  platform: string,
): BrowserShortcut | undefined {
  if (platform !== "darwin" && platform !== "linux") {
    return undefined;
  }
  const primary = platform === "darwin" ? input.meta : input.control;
  const other = platform === "darwin" ? input.control : input.meta;
  if (input.type !== "keyDown" || other || input.alt) {
    return undefined;
  }
  const key = input.key.toLowerCase();
  if (!primary) {
    return key === "escape" && !input.shift && findOpen ? "closeFind" : undefined;
  }
  // "+" needs Shift on many keyboards. The primary modifier and = or + zoom in with or
  // without Shift.
  if (key === "=" || key === "+") {
    return "zoomIn";
  }
  if (input.shift) {
    if (key === "g") {
      return "findPrevious";
    }
    return key === "t" ? "reopenClosedTab" : undefined;
  }
  switch (key) {
    case "b":
      return "toggleExplorer";
    case "t":
      return "newTerminal";
    case "f":
      return "find";
    case "g":
      return "findNext";
    case "-":
      return "zoomOut";
    case "0":
      return "zoomReset";
    case "l":
      return "focusAddress";
    default:
      return undefined;
  }
}
