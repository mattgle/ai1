import * as assert from "node:assert/strict";
import { attentionCaption, attentionClass, TerminalAttentionState } from "./terminal-attention";

describe("terminal attention", () => {
  it("keeps working visible after selection and clears it when idle", () => {
    const state = new TerminalAttentionState();
    state.update("working", false);
    assert.equal(state.attention, "working");
    state.select();
    assert.equal(state.attention, "working");
    assert.equal(attentionCaption("sh · Test", state.attention), "sh · Test\nWorking");
    assert.equal(attentionClass("custom ai1-attention-working", undefined), "custom");
    state.update("idle", true);
    assert.equal(state.attention, undefined);
  });
  it("marks hidden completion and clears it on selection", () => {
    const state = new TerminalAttentionState();
    state.update("working", false);
    state.update("done", false);
    assert.equal(state.attention, "done");
    state.select();
    assert.equal(state.attention, undefined);
    state.update("done", false);
    assert.equal(state.attention, undefined);
  });

  it("keeps input attention until the request is resolved", () => {
    const state = new TerminalAttentionState();
    state.update("blocked", false);
    state.select();
    assert.equal(state.attention, "input");
    state.update("blocked", true);
    assert.equal(state.attention, "input");
    state.update("working", true);
    assert.equal(state.attention, "working");
  });

  it("does not mark a completion that is already selected", () => {
    const state = new TerminalAttentionState();
    state.update("done", true);
    assert.equal(state.attention, undefined);
    state.update("done", false);
    assert.equal(state.attention, undefined);
  });

  it("marks a new outcome after another turn", () => {
    const state = new TerminalAttentionState();
    state.update("failed", false);
    assert.equal(state.attention, "failed");
    state.select();
    state.update("working", false);
    state.update("failed", false);
    assert.equal(state.attention, "failed");
    state.update("idle", false);
    assert.equal(state.attention, undefined);
  });

  it("preserves other title classes and gives a text description", () => {
    assert.equal(
      attentionClass("pinned ai1-attention-input custom", "done"),
      "pinned custom ai1-attention-done",
    );
    assert.equal(attentionClass("pinned ai1-attention-done", undefined), "pinned");
    assert.equal(attentionCaption("OC · Test", "input"), "OC · Test\nNeeds your input");
    assert.equal(attentionCaption("OC · Test", undefined), "OC · Test");
  });

  it("marks a new hook completion but does not repeat an acknowledged record", () => {
    const state = new TerminalAttentionState();
    state.update("done", false, "first");
    state.select();
    state.update("done", false, "first");
    assert.equal(state.attention, undefined);
    state.update("done", false, "second");
    assert.equal(state.attention, "done");
  });
});
