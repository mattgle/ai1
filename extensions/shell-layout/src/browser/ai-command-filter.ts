import { Command } from "@theia/core";

// The AI packages of Theia put their commands in the category "AI".
export function isAiCommand(command: Command): boolean {
  return command.category === "AI";
}
