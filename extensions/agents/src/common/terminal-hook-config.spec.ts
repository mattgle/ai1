import * as assert from "node:assert/strict";
import { terminalHookConfig } from "./terminal-hook-config";

describe("agent attention hook configuration", () => {
  it("uses milliseconds for Gemini and seconds for Claude and Codex", () => {
    for (const agent of ["claude", "codex", "gemini"] as const) {
      const config = terminalHookConfig(agent, "node helper.js") as {
        hooks: Record<string, { hooks: { type: string; command: string; timeout: number }[] }[]>;
      };
      for (const definitions of Object.values(config.hooks)) {
        assert.deepEqual(definitions[0].hooks[0], {
          type: "command",
          command: "node helper.js",
          timeout: agent === "gemini" ? 2000 : 2,
        });
      }
      assert.equal("StopFailure" in config.hooks, agent === "claude");
      assert.equal("BeforeAgent" in config.hooks, agent === "gemini");
    }
  });
});
