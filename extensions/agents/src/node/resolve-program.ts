import * as fs from "node:fs";
import { findOnPath } from "../common/find-on-path";
import { notInstalledMessage } from "./opencode-client";

function isExecutableFile(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Resolves `name` to its absolute path from `process.env.PATH`, so a
// terminal's `shellPath` is always an existing, executable file.
// `ShellTerminalServer.isValidShell` (`node_modules/@theia/terminal/src/
// node/shell-terminal-server.ts`) checks a terminal's `shellPath` with
// `fs.accessSync(shell, X_OK)` on the literal string, with no PATH lookup of
// its own. A bare program name such as "opencode" fails that check, so
// Theia silently falls back to the user's default shell and hands it the
// program's own arguments as its own arguments; the shell exits at once.
// Resolving the absolute path here keeps `shellPath` a real, executable
// file, so Theia's own check accepts it.
export function resolveProgram(name: "opencode" | "tmux"): string {
  const found = findOnPath(name, process.env.PATH, isExecutableFile);
  if (!found) {
    throw new Error(notInstalledMessage(name));
  }
  return found;
}
