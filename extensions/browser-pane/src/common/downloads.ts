// The downloads of the AI1 browser: the entries of the Downloads view and the
// small rules that the main process and the view share.

export type DownloadState = "progressing" | "completed" | "cancelled" | "failed" | "deleted";

export interface DownloadEntry {
  id: string;
  fileName: string;
  // The full path of the file.
  savePath: string;
  url: string;
  profileId: string;
  totalBytes: number;
  receivedBytes: number;
  // The start time in milliseconds since 1970.
  startTime: number;
  state: DownloadState;
  error?: string;
}

// The message to the window of the page when a download is done.
export interface DownloadDone {
  id: string;
  fileName: string;
  state: DownloadState;
}

// Only the e2e script sets these variables. AI1 reads them only when
// `AI1_E2E_BACKGROUND` is 1, so a normal start never uses them.
export const E2E_DOWNLOADS_DIR = "AI1_E2E_DOWNLOADS_DIR";
export const E2E_SHELL_LOG = "AI1_E2E_SHELL_LOG";

export function e2eSetting(env: Record<string, string | undefined>, name: string): string | undefined {
  if (env.AI1_E2E_BACKGROUND !== "1") {
    return undefined;
  }
  const value = env[name];
  return value ? value : undefined;
}

// Lets one progress message go for each download in each interval. A state
// change does not go through this: it goes at once.
export class ProgressThrottle {
  protected readonly lastSent = new Map<string, number>();

  constructor(
    protected readonly intervalMs: number,
    protected readonly now: () => number,
  ) {}

  shouldSend(id: string): boolean {
    const now = this.now();
    const last = this.lastSent.get(id);
    if (last !== undefined && now - last < this.intervalMs) {
      return false;
    }
    this.lastSent.set(id, now);
    return true;
  }

  forget(id: string): void {
    this.lastSent.delete(id);
  }
}

// The host of the address of a download, or an empty text when it has none
// (for example a `data:` address).
export function downloadHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const UNITS = ["KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}
