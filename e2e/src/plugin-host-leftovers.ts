import * as path from "node:path";

export function getPluginHostPath(developmentApplication: string, packagedResources?: string): string {
  return path.resolve(packagedResources || developmentApplication, "lib/backend/plugin-host");
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  startMs: number;
  command: string;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One line of `ps -A -o pid=,ppid=,lstart=,command=` run with `LC_ALL=C`.
// `lstart` is the local start time with a precision of one second, for
// example `Wed Sep 23 14:13:05 2026`.
const psLine = /^\s*(\d+)\s+(\d+)\s+\w{3} (\w{3}) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})\s+(.*)$/;

export function parsePsOutput(output: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const line of output.split("\n")) {
    const match = psLine.exec(line);
    if (!match) {
      continue;
    }
    const [, pid, ppid, month, day, hours, minutes, seconds, year, command] = match;
    processes.push({
      pid: Number(pid),
      ppid: Number(ppid),
      startMs: new Date(
        Number(year),
        months.indexOf(month),
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds),
      ).getTime(),
      command,
    });
  }
  return processes;
}

// A plugin host of this app whose parent is gone (the system gave it to
// pid 1) and that started during the suite. The start time from `ps` has no
// milliseconds, so the suite start is rounded down to its second.
export function findLeftoverPluginHosts(
  processes: ProcessInfo[],
  options: { suiteStartMs: number; pluginHostPath: string },
): ProcessInfo[] {
  const suiteStartSecondMs = Math.floor(options.suiteStartMs / 1000) * 1000;
  return processes.filter(
    (candidate) =>
      candidate.ppid === 1 &&
      candidate.startMs >= suiteStartSecondMs &&
      candidate.command.includes(options.pluginHostPath),
  );
}
