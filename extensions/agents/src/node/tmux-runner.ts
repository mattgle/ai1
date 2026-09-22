import { execFile } from "node:child_process";
import { parseTmuxList } from "../common/tmux-list";

// Lists the AI1 tmux sessions. No server gives an empty list.
export function listTmuxSessions(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("tmux", ["ls"], { encoding: "utf8" }, (_error, stdout, stderr) => {
      resolve(parseTmuxList(`${stdout}${stderr}`));
    });
  });
}

export function tmuxNewCommand(name: string, directory: string): { program: string; args: string[] } {
  return { program: "tmux", args: ["new", "-A", "-s", name, "-c", directory] };
}
