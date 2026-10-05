import * as assert from "node:assert/strict";
import { applyHookSignal, terminalHookSignal } from "./terminal-hook-event";

describe("terminal hook signals", () => {
  it("maps Gemini's official turn and permission events only", () => {
    assert.deepEqual(terminalHookSignal("gemini", { hook_event_name: "BeforeAgent" }), { kind: "start" });
    assert.deepEqual(terminalHookSignal("gemini", { hook_event_name: "AfterAgent" }), { kind: "complete" });
    assert.deepEqual(
      terminalHookSignal("gemini", { hook_event_name: "Notification", notification_type: "ToolPermission" }),
      { kind: "input", key: "gemini-permission-without-resolution-id" },
    );
    for (const event of ["Stop", "StopFailure", "UserPromptSubmit", "AfterTool", "Unknown"])
      assert.equal(terminalHookSignal("gemini", { hook_event_name: event }), undefined);
    assert.equal(
      terminalHookSignal("gemini", { hook_event_name: "Notification", notification_type: "Other" }),
      undefined,
    );
  });

  it("keeps Gemini permission attention until a definite turn or session boundary", () => {
    const input = terminalHookSignal("gemini", {
      hook_event_name: "Notification",
      notification_type: "ToolPermission",
    })!;
    const blocked = applyHookSignal({ status: "working", pending: {} }, input);
    assert.equal(blocked.status, "blocked");
    for (const event of ["AfterAgent", "BeforeAgent", "SessionEnd"]) {
      const state = applyHookSignal(blocked, terminalHookSignal("gemini", { hook_event_name: event })!);
      assert.deepEqual(state.pending, {});
      assert.notEqual(state.status, "blocked");
    }
  });
  it("maps only supported events and ignores subagents", () => {
    assert.deepEqual(terminalHookSignal("claude", { hook_event_name: "StopFailure" }), { kind: "fail" });
    assert.equal(terminalHookSignal("codex", { hook_event_name: "StopFailure" }), undefined);
    assert.equal(terminalHookSignal("claude", { hook_event_name: "Stop", agent_id: "child" }), undefined);
    assert.equal(
      terminalHookSignal("claude", {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      }),
      undefined,
    );
    assert.deepEqual(
      terminalHookSignal("claude", { hook_event_name: "PreToolUse", tool_name: "AskUserQuestion" }),
      { kind: "input", key: "question-without-resolution-id" },
    );
  });

  it("keeps multiple permission requests until matching tool results arrive", () => {
    let state = { status: "working" as const, pending: {} } as ReturnType<typeof applyHookSignal>;
    state = applyHookSignal(state, { kind: "input", key: "Bash" });
    state = applyHookSignal(state, { kind: "input", key: "Bash" });
    state = applyHookSignal(state, { kind: "tool-end", key: "Read" });
    assert.equal(state.status, "blocked");
    state = applyHookSignal(state, { kind: "tool-end", key: "Bash" });
    assert.equal(state.status, "blocked");
    state = applyHookSignal(state, { kind: "tool-end", key: "Bash" });
    assert.equal(state.status, "working");
  });

  it("ends pending requests when the turn or session ends", () => {
    const blocked = { status: "blocked" as const, pending: { Bash: 1 } };
    assert.deepEqual(applyHookSignal(blocked, { kind: "complete" }), { status: "done", pending: {} });
    assert.deepEqual(applyHookSignal(blocked, { kind: "start" }), { status: "working", pending: {} });
    assert.deepEqual(applyHookSignal(blocked, { kind: "end" }), { status: "idle", pending: {} });
  });

  it("does not infer a permission reply from a different completed tool", () => {
    const signal = terminalHookSignal("claude", { hook_event_name: "PermissionRequest", tool_name: "Bash" })!;
    const state = applyHookSignal({ status: "working", pending: {} }, signal);
    const completed = terminalHookSignal("claude", {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "different-tool",
    })!;
    assert.equal(applyHookSignal(state, completed).status, "blocked");
  });
});
