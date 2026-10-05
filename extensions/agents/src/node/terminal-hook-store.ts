import * as fs from "node:fs/promises";
import * as path from "node:path";
import { constants } from "node:fs";
import { SessionStatus } from "../common/agents-protocol";
import { HookState } from "../common/terminal-hook-event";

export interface TerminalHookRecord extends HookState {
  token: string;
  pane: string;
  sessionHash: string;
  timestamp: number;
}

export interface TerminalHookAttention {
  name: string;
  token: string;
  status: SessionStatus;
}

export async function readTerminalHookRecord(
  directory: string,
  name: string,
): Promise<TerminalHookRecord | undefined> {
  if (!/^ai1-\d+$/.test(name)) return undefined;
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    file = await fs.open(path.join(directory, `${name}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077) !== 0) return undefined;
    const value = JSON.parse(await file.readFile("utf8"));
    if (
      !value ||
      !["working", "blocked", "done", "failed", "idle"].includes(value.status) ||
      typeof value.token !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.token) ||
      typeof value.pane !== "string" ||
      !/^%\d+$/.test(value.pane) ||
      typeof value.sessionHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sessionHash) ||
      !Number.isSafeInteger(value.timestamp) ||
      value.timestamp < 0 ||
      !value.pending ||
      typeof value.pending !== "object" ||
      Array.isArray(value.pending) ||
      Object.entries(value.pending).some(
        ([key, count]) =>
          !/^[a-f0-9]{64}$/.test(key) ||
          !Number.isSafeInteger(count) ||
          Number(count) < 1 ||
          Number(count) > 100,
      )
    )
      return undefined;
    return value as TerminalHookRecord;
  } catch {
    return undefined;
  } finally {
    await file?.close();
  }
}
