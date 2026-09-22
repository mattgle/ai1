import * as assert from "node:assert";
import { Command } from "@theia/core";
import { isAiCommand } from "./ai-command-filter";

describe("isAiCommand", () => {
  it("reports a command of the category AI as an AI command", () => {
    const command: Command = { id: "ai.test", category: "AI" };
    assert.strictEqual(isAiCommand(command), true);
  });

  it("reports a command of another category, or no category, as not an AI command", () => {
    const fileCommand: Command = { id: "file.test", category: "File" };
    const bareCommand: Command = { id: "bare.test" };
    assert.strictEqual(isAiCommand(fileCommand), false);
    assert.strictEqual(isAiCommand(bareCommand), false);
  });
});
