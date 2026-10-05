import { SessionStatus } from "./agents-protocol";

export type HookAgent = "claude" | "codex" | "gemini";
export type HookSignal =
  { kind: "start" | "complete" | "fail" | "end" } | { kind: "input" | "tool-end"; key: string };

export function terminalHookSignal(agent: HookAgent, input: Record<string, unknown>): HookSignal | undefined {
  if (input.agent_id) return undefined;
  const event = input.hook_event_name;
  if (agent === "gemini") {
    if (event === "BeforeAgent") return { kind: "start" };
    if (event === "AfterAgent") return { kind: "complete" };
    if (event === "SessionStart" || event === "SessionEnd") return { kind: "end" };
    if (event === "Notification" && input.notification_type === "ToolPermission")
      return { kind: "input", key: "gemini-permission-without-resolution-id" };
    return undefined;
  }
  const tool = typeof input.tool_name === "string" ? input.tool_name : "unknown";
  const toolId = typeof input.tool_use_id === "string" ? input.tool_use_id : undefined;
  if (event === "UserPromptSubmit") return { kind: "start" };
  if (event === "SessionStart" || event === "SessionEnd") return { kind: "end" };
  if (event === "PermissionRequest") return { kind: "input", key: "permission-without-resolution-id" };
  if (event === "PreToolUse" && (tool === "AskUserQuestion" || tool === "request_user_input"))
    return { kind: "input", key: toolId ? `tool:${toolId}` : "question-without-resolution-id" };
  if (event === "PostToolUse") return toolId ? { kind: "tool-end", key: `tool:${toolId}` } : undefined;
  if (event === "Stop") return { kind: "complete" };
  if (agent === "claude" && event === "StopFailure") return { kind: "fail" };
  if (agent === "claude" && event === "Elicitation") return { kind: "input", key: "elicitation" };
  if (agent === "claude" && event === "ElicitationResult") return { kind: "tool-end", key: "elicitation" };
  return undefined;
}

export interface HookState {
  status: SessionStatus;
  pending: Record<string, number>;
}

export function applyHookSignal(state: HookState, signal: HookSignal): HookState {
  if (signal.kind === "start") return { status: "working", pending: {} };
  if (signal.kind === "complete") return { status: "done", pending: {} };
  if (signal.kind === "fail") return { status: "failed", pending: {} };
  if (signal.kind === "end") return { status: "idle", pending: {} };
  if (!("key" in signal)) return state;
  const pending = { ...state.pending };
  if (signal.kind === "input") {
    pending[signal.key] = (pending[signal.key] ?? 0) + 1;
  } else if (pending[signal.key]) {
    if (pending[signal.key] === 1) delete pending[signal.key];
    else pending[signal.key] -= 1;
  }
  return { status: Object.keys(pending).length ? "blocked" : "working", pending };
}
