import { HookAgent } from "./terminal-hook-event";

export function terminalHookConfig(agent: HookAgent, command: string): object {
  const events =
    agent === "gemini"
      ? ["SessionStart", "SessionEnd", "BeforeAgent", "AfterAgent", "Notification"]
      : [
          "SessionStart",
          "SessionEnd",
          "UserPromptSubmit",
          "PermissionRequest",
          "PreToolUse",
          "PostToolUse",
          "Stop",
          ...(agent === "claude" ? ["StopFailure", "Elicitation", "ElicitationResult"] : []),
        ];
  return {
    hooks: Object.fromEntries(
      events.map((event) => [
        event,
        [{ hooks: [{ type: "command", command, timeout: agent === "gemini" ? 2000 : 2 }] }],
      ]),
    ),
  };
}
