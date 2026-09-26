import * as fs from "node:fs";
import * as path from "node:path";
import { DownloadEntry, DownloadState } from "../common/downloads";

export const DOWNLOAD_LIMIT = 100;
export const CLOSED_DURING_DOWNLOAD = "AI1 closed during the download.";
const PROGRESS_SAVE_MS = 2000;
const STATES: DownloadState[] = ["progressing", "completed", "cancelled", "failed", "deleted"];

function isEntry(value: unknown): value is DownloadEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    ["id", "fileName", "savePath", "url", "profileId"].every((key) => typeof entry[key] === "string") &&
    ["totalBytes", "receivedBytes", "startTime"].every((key) => typeof entry[key] === "number") &&
    STATES.includes(entry.state as DownloadState) &&
    (entry.error === undefined || typeof entry.error === "string")
  );
}

// The last 100 downloads, newest first, kept in one JSON file in Electron's
// user data folder. A state change writes the file at once. Progress writes
// it at most once in 2 seconds. It has no `electron` import, so plain mocha
// tests it.
export class DownloadStore {
  protected entries: DownloadEntry[] = [];
  protected lastSave = Number.NEGATIVE_INFINITY;

  constructor(
    protected readonly filePath: string,
    protected readonly fileExists: (path: string) => boolean,
    protected readonly now: () => number = Date.now,
  ) {}

  // A download that was in progress when AI1 closed cannot continue.
  load(): void {
    this.entries = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as { downloads?: unknown };
      if (Array.isArray(parsed.downloads)) {
        this.entries = parsed.downloads.filter(isEntry).slice(0, DOWNLOAD_LIMIT);
      }
    } catch {
      this.entries = [];
    }
    let changed = false;
    for (const entry of this.entries) {
      if (entry.state === "progressing") {
        entry.state = "failed";
        entry.error = CLOSED_DURING_DOWNLOAD;
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  list(): DownloadEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  get(id: string): DownloadEntry | undefined {
    const entry = this.entries.find((candidate) => candidate.id === id);
    return entry ? { ...entry } : undefined;
  }

  add(entry: DownloadEntry): void {
    this.entries.unshift({ ...entry });
    this.entries.length = Math.min(this.entries.length, DOWNLOAD_LIMIT);
    this.save();
  }

  update(id: string, change: Partial<DownloadEntry>): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      return;
    }
    const stateChange = change.state !== undefined && change.state !== entry.state;
    Object.assign(entry, change, { id });
    if (stateChange || this.now() - this.lastSave >= PROGRESS_SAVE_MS) {
      this.save();
    }
  }

  remove(id: string): void {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.save();
  }

  // Removes all entries that are not in progress.
  clearFinished(): void {
    this.entries = this.entries.filter((entry) => entry.state === "progressing");
    this.save();
  }

  // Marks a completed download whose file is gone. Gives true when an entry
  // changed.
  refreshDeleted(): boolean {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.state === "completed" && !this.fileExists(entry.savePath)) {
        entry.state = "deleted";
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
    return changed;
  }

  // Writes a temporary file and renames it, so a crash cannot leave half a
  // file.
  protected save(): void {
    this.lastSave = this.now();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ downloads: this.entries }, undefined, 2));
    fs.renameSync(temporary, this.filePath);
  }
}
