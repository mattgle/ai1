import * as assert from "node:assert";
import { shortcutFor } from "./shortcuts";

interface Keys {
  type?: string;
  meta?: boolean;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
}

function key(keyName: string, keys: Keys = {}, findOpen = false) {
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
  );
}

describe("shortcutFor", () => {
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
    assert.strictEqual(key("t", { meta: true }), undefined);
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
