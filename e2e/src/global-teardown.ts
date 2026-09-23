import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { findLeftoverPluginHosts, parsePsOutput, type ProcessInfo } from "./plugin-host-leftovers";

const pluginHostPath = path.resolve(
  __dirname,
  "..",
  "..",
  "applications",
  "electron",
  "lib",
  "backend",
  "plugin-host",
);

// A plugin host can need a moment to see that its app closed and to stop.
const graceMs = 10_000;
const pollMs = 500;

function listLeftovers(suiteStartMs: number): ProcessInfo[] {
  const output = execFileSync("ps", ["-A", "-o", "pid=,ppid=,lstart=,command="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  return findLeftoverPluginHosts(parsePsOutput(output), { suiteStartMs, pluginHostPath });
}

// Fails the run when a plugin host that the suite started outlives its app.
// This only looks at processes: it never stops one.
export default async function globalTeardown(): Promise<void> {
  const suiteStartMs = Number(process.env.AI1_E2E_SUITE_START_MS);
  if (!Number.isFinite(suiteStartMs)) {
    throw new Error("AI1_E2E_SUITE_START_MS is not set: the global setup did not run");
  }
  let leftovers = listLeftovers(suiteStartMs);
  const deadline = Date.now() + graceMs;
  while (leftovers.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    leftovers = listLeftovers(suiteStartMs);
  }
  if (leftovers.length > 0) {
    const lines = leftovers.map((leftover) => `  pid ${leftover.pid}: ${leftover.command}`).join("\n");
    throw new Error(
      `plugin host processes of this suite are still running after their app closed:\n${lines}`,
    );
  }
}
