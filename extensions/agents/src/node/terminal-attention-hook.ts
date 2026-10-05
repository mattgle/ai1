import * as fs from "node:fs/promises";
import { Buffer } from "node:buffer";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lock } from "proper-lockfile";
import { applyHookSignal, HookAgent, terminalHookSignal } from "../common/terminal-hook-event";
import { readTerminalHookRecord, TerminalHookRecord } from "./terminal-hook-store";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

export async function writeTerminalHook(
  directory: string,
  name: string,
  pane: string,
  agent: HookAgent,
  input: Record<string, unknown>,
): Promise<void> {
  if (!path.isAbsolute(directory) || !/^ai1-\d+$/.test(name) || !/^%\d+$/.test(pane)) return;
  const signal = terminalHookSignal(agent, input);
  if (!signal || typeof input.session_id !== "string" || input.session_id.length > 256) return;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) return;
  const release = await lock(directory, {
    lockfilePath: path.join(directory, `${name}.lock`),
    stale: 10000,
    retries: { retries: 10, minTimeout: 10, maxTimeout: 20 },
  });
  const temporary = path.join(directory, `${name}-${randomUUID()}.tmp`);
  try {
    const sessionHash = hash(`${agent}:${input.session_id}`);
    const previous = await readTerminalHookRecord(directory, name);
    const base =
      previous?.pane === pane && previous.sessionHash === sessionHash
        ? previous
        : { status: "idle" as const, pending: {} };
    const safeSignal = "key" in signal ? { ...signal, key: hash(signal.key) } : signal;
    const state = applyHookSignal(base, safeSignal);
    const record: TerminalHookRecord = {
      ...state,
      token: randomUUID(),
      pane,
      sessionHash,
      timestamp: Date.now(),
    };
    const text = JSON.stringify(record);
    if (Buffer.byteLength(text) > 8192) return;
    await fs.writeFile(temporary, text, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, path.join(directory, `${name}.json`));
  } finally {
    await fs.unlink(temporary).catch(() => {});
    await release();
  }
}

async function main(): Promise<void> {
  const [agent, directory] = process.argv.slice(2);
  if (
    (agent !== "claude" && agent !== "codex" && agent !== "gemini") ||
    !directory ||
    !/^%\d+$/.test(process.env.TMUX_PANE ?? "")
  )
    return;
  let text = "";
  for await (const data of process.stdin) {
    text += data.toString();
    if (Buffer.byteLength(text) > 1024 * 1024) return;
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const pane = process.env.TMUX_PANE!;
  const name = execFileSync("tmux", ["display-message", "-p", "-t", pane, "#{session_name}"], {
    encoding: "utf8",
    timeout: 1000,
  }).trim();
  await writeTerminalHook(directory, name, pane, agent, input);
}

if (require.main === module) {
  main()
    .catch(() => {})
    .finally(() => process.stdout.write("{}\n"));
}
