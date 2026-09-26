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
// get. Only for macOS: `meta` is ⌘. Escape is a shortcut only while the find
// bar is open.
export function shortcutFor(input: ShortcutInput, findOpen: boolean): BrowserShortcut | undefined {
  if (input.type !== "keyDown" || input.control || input.alt) {
    return undefined;
  }
  const key = input.key.toLowerCase();
  if (!input.meta) {
    return key === "escape" && !input.shift && findOpen ? "closeFind" : undefined;
  }
  // "+" needs Shift on many keyboards, so ⌘= and ⌘+ zoom in with or
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
