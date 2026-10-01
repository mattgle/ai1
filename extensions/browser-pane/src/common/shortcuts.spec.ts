import * as assert from "node:assert";
import { shortcutFor } from "./shortcuts";

interface Keys {
  type?: string;
  meta?: boolean;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
}

function key(keyName: string, keys: Keys = {}, findOpen = false, platform = "darwin") {
  return shortcutFor(
    {
      type: keys.type ?? "keyDown",
      key: keyName,
      meta: keys.meta ?? false,
      control: keys.control ?? false,
      shift: keys.shift ?? false,
      alt: keys.alt ?? false,
    },
    findOpen,
    platform,
  );
}

describe("shortcutFor", () => {
  it("uses Control for Linux guest shortcuts", () => {
    for (const [name, action] of [
      ["b", "toggleExplorer"],
      ["t", "newTerminal"],
      ["f", "find"],
      ["g", "findNext"],
      ["=", "zoomIn"],
      ["+", "zoomIn"],
      ["-", "zoomOut"],
      ["0", "zoomReset"],
      ["l", "focusAddress"],
    ]) {
      assert.strictEqual(key(name, { control: true }, false, "linux"), action);
      assert.strictEqual(key(name, { meta: true }, false, "linux"), undefined);
      assert.strictEqual(key(name, { control: true, meta: true }, false, "linux"), undefined);
      assert.strictEqual(key(name, { control: true, alt: true }, false, "linux"), undefined);
      assert.strictEqual(key(name, {}, false, "linux"), undefined);
    }
    assert.strictEqual(key("G", { control: true, shift: true }, false, "linux"), "findPrevious");
    assert.strictEqual(key("T", { control: true, shift: true }, false, "linux"), "reopenClosedTab");
    assert.strictEqual(key("+", { control: true, shift: true }, false, "linux"), "zoomIn");
    assert.strictEqual(key("f", { control: true, shift: true }, false, "linux"), undefined);
    assert.strictEqual(key("f", { control: true, type: "keyUp" }, false, "linux"), undefined);
    assert.strictEqual(key("c", { control: true }, false, "linux"), undefined);
    assert.strictEqual(key("Escape", {}, true, "linux"), "closeFind");
    assert.strictEqual(key("Escape", {}, false, "linux"), undefined);
    assert.strictEqual(key("Escape", { control: true }, true, "linux"), undefined);
    assert.strictEqual(key("Escape", { meta: true }, true, "linux"), undefined);
    assert.strictEqual(key("Escape", { shift: true }, true, "linux"), undefined);
  });

  it("leaves keys unchanged on an unsupported platform", () => {
    for (const platform of ["win32", "", "unknown"]) {
      assert.strictEqual(key("f", { control: true }, false, platform), undefined);
      assert.strictEqual(key("f", { meta: true }, false, platform), undefined);
      assert.strictEqual(key("Escape", {}, true, platform), undefined);
    }
  });
  it("gives toggleExplorer for Command-B", () => {
    assert.strictEqual(key("b", { meta: true }), "toggleExplorer");
    assert.strictEqual(key("b", { meta: true, shift: true }), undefined);
    assert.strictEqual(key("b"), undefined);
  });
  it("gives find for ⌘F", () => {
    assert.strictEqual(key("f", { meta: true }), "find");
  });

  it("gives findNext for ⌘G and findPrevious for ⇧⌘G", () => {
    assert.strictEqual(key("g", { meta: true }), "findNext");
    assert.strictEqual(key("G", { meta: true, shift: true }), "findPrevious");
    assert.strictEqual(key("g", { meta: true, shift: true }), "findPrevious");
  });

  it("gives closeFind for Escape only while the find bar is open", () => {
    assert.strictEqual(key("Escape", {}, true), "closeFind");
    assert.strictEqual(key("Escape", {}, false), undefined);
  });

  it("gives undefined for Escape with a modifier", () => {
    assert.strictEqual(key("Escape", { meta: true }, true), undefined);
    assert.strictEqual(key("Escape", { shift: true }, true), undefined);
    assert.strictEqual(key("Escape", { alt: true }, true), undefined);
    assert.strictEqual(key("Escape", { control: true }, true), undefined);
  });

  it("gives zoomIn for ⌘= and ⌘+, with or without Shift", () => {
    assert.strictEqual(key("=", { meta: true }), "zoomIn");
    assert.strictEqual(key("+", { meta: true, shift: true }), "zoomIn");
    assert.strictEqual(key("+", { meta: true }), "zoomIn");
    assert.strictEqual(key("=", { meta: true, shift: true }), "zoomIn");
  });

  it("gives zoomOut for ⌘- and zoomReset for ⌘0", () => {
    assert.strictEqual(key("-", { meta: true }), "zoomOut");
    assert.strictEqual(key("0", { meta: true }), "zoomReset");
  });

  it("gives reopenClosedTab for ⇧⌘T only", () => {
    assert.strictEqual(key("T", { meta: true, shift: true }), "reopenClosedTab");
    assert.strictEqual(key("t", { meta: true, shift: true }), "reopenClosedTab");
    assert.strictEqual(key("t", { meta: true }), "newTerminal");
  });

  it("gives focusAddress for ⌘L", () => {
    assert.strictEqual(key("l", { meta: true }), "focusAddress");
  });

  it("gives undefined for ⌘F with Shift, Alt, or Control", () => {
    assert.strictEqual(key("F", { meta: true, shift: true }), undefined);
    assert.strictEqual(key("f", { meta: true, alt: true }), undefined);
    assert.strictEqual(key("ƒ", { meta: true, alt: true }), undefined);
    assert.strictEqual(key("f", { meta: true, control: true }), undefined);
  });

  it("gives undefined for each shortcut key with Control or Alt", () => {
    for (const keyName of ["f", "g", "=", "+", "-", "0", "t", "l"]) {
      assert.strictEqual(key(keyName, { meta: true, control: true }), undefined, `⌃⌘${keyName}`);
      assert.strictEqual(key(keyName, { meta: true, alt: true }), undefined, `⌥⌘${keyName}`);
    }
  });

  it("gives undefined for the keys without ⌘", () => {
    for (const keyName of ["f", "g", "=", "+", "-", "0", "t", "l"]) {
      assert.strictEqual(key(keyName), undefined, keyName);
      assert.strictEqual(key(keyName, { control: true }), undefined, `⌃${keyName}`);
    }
  });

  it("gives undefined for other keys", () => {
    assert.strictEqual(key("a", { meta: true }), undefined);
    assert.strictEqual(key("c", { meta: true }), undefined);
    assert.strictEqual(key("Enter", {}, true), undefined);
    assert.strictEqual(key("f"), undefined);
  });

  it("gives undefined for a keyUp", () => {
    assert.strictEqual(key("f", { type: "keyUp", meta: true }), undefined);
    assert.strictEqual(key("Escape", { type: "keyUp" }, true), undefined);
    assert.strictEqual(key("=", { type: "keyUp", meta: true }), undefined);
  });
});
