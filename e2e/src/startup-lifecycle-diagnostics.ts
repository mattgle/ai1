export interface StartupLifecycleRecord {
  launch: number;
  phase: string;
  windowMs?: number;
  exitCode?: number | null;
  signal?: string | null;
  stdoutBytes: number;
  stderrBytes: number;
  errorMarkers: string[];
  stackSymbols: string[];
}

const nativeFatalMarkers = [
  "napi_fatal_error",
  "FATAL ERROR",
  "Cannot create a handle without a HandleScope",
];
const errorMarkers = [
  ...nativeFatalMarkers,
  "Channel closed",
  "ERR_IPC_CHANNEL_CLOSED",
  "UnhandledPromiseRejection",
  "EADDRINUSE",
  "TypeError",
  "ReferenceError",
];

export function createStartupOutputObserver(
  record: StartupLifecycleRecord,
): (stream: "stdout" | "stderr", chunk: Buffer) => void {
  const tails = { stdout: "", stderr: "" };
  return (stream, chunk) => {
    if (stream === "stdout") record.stdoutBytes += chunk.length;
    else record.stderrBytes += chunk.length;
    const tail = tails[stream] + chunk.toString();
    tails[stream] = tail.slice(-8192);
    for (const marker of errorMarkers) {
      if (tail.includes(marker) && !record.errorMarkers.includes(marker)) record.errorMarkers.push(marker);
    }
    for (const match of tail.matchAll(/^\s+at ([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gm)) {
      if (!record.stackSymbols.includes(match[1]) && record.stackSymbols.length < 30) {
        record.stackSymbols.push(match[1]);
      }
    }
  };
}

export function assertStartupExit(record: StartupLifecycleRecord, mode: "shared" | "forked"): void {
  if (
    record.phase !== "closed" ||
    record.signal !== null ||
    !(mode === "shared" ? [0, 1] : [0]).includes(record.exitCode ?? -1)
  ) {
    throw new Error("The application does not complete its expected normal exit.");
  }
  const fatal = record.errorMarkers.filter((marker) => nativeFatalMarkers.includes(marker));
  if (fatal.length) throw new Error(`Native fatal markers appear during the lifecycle: ${fatal.join(", ")}`);
}
