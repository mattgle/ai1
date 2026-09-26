import * as fs from "node:fs";
import * as path from "node:path";
import { HistoryEntry } from "../common/history";
import { partitionFor, profileIdFromPartition } from "../common/profiles";

// A visit to the address of the newest entry within this time updates that
// entry and adds no new entry.
export const HISTORY_MERGE_MS = 60_000;
export const HISTORY_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 10_000;
// The store writes the file of a profile at most once in this time.
export const HISTORY_SAVE_MS = 5_000;

export interface HistoryTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

// A timer that does not keep the process alive.
const REAL_TIMERS: HistoryTimers = {
  set: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return timer;
  },
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

// Writes a temporary file and renames it, so a crash cannot leave half a
// file.
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.url === "string" && typeof entry.title === "string" && typeof entry.time === "number";
}

// The profile id is the file name, so only a valid profile id is safe.
function isSafeProfileId(profileId: string): boolean {
  return typeof profileId === "string" && profileIdFromPartition(partitionFor(profileId)) === profileId;
}

interface ProfileHistory {
  // Newest first.
  entries: HistoryEntry[];
  // The timer of the next write, while a change is not written.
  timer: unknown;
  dirty: boolean;
}

// The browsing history of each profile, kept in one JSON file for each
// profile in `folder`. The file of a profile loads at its first use. It has
// no `electron` import, so plain mocha tests it.
export class HistoryStore {
  protected readonly profiles = new Map<string, ProfileHistory>();
  // A page of a deleted profile can still send a navigation after the
  // delete. It must not make a new file.
  protected readonly deletedProfiles = new Set<string>();

  constructor(
    protected readonly folder: string,
    protected readonly now: () => number = Date.now,
    protected readonly writeFile: (file: string, text: string) => void = writeAtomic,
    protected readonly readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf8"),
    protected readonly removeFile: (file: string) => void = (file) => fs.rmSync(file, { force: true }),
    protected readonly timers: HistoryTimers = REAL_TIMERS,
  ) {}

  visit(profileId: string, url: string, title: string): void {
    const history = this.load(profileId);
    if (!history) {
      return;
    }
    const time = this.now();
    const newest = history.entries[0];
    if (newest && newest.url === url && time - newest.time <= HISTORY_MERGE_MS) {
      newest.time = time;
      // A navigation can come before the page has its title. Keep the old
      // title until `setTitle` gives the new one.
      if (title !== "") {
        newest.title = title;
      }
    } else {
      history.entries.unshift({ url, title, time });
      history.entries.length = Math.min(history.entries.length, HISTORY_LIMIT);
    }
    this.changed(profileId, history);
  }

  // Sets the title of the newest entry with this address.
  setTitle(profileId: string, url: string, title: string): void {
    const history = this.load(profileId);
    const entry = history?.entries.find((candidate) => candidate.url === url);
    if (!history || !entry || entry.title === title) {
      return;
    }
    entry.title = title;
    this.changed(profileId, history);
  }

  // Newest first.
  list(profileId: string): HistoryEntry[] {
    return (this.load(profileId)?.entries ?? []).map((entry) => ({ ...entry }));
  }

  // Removes all entries of the profile and writes the file at once.
  clear(profileId: string): void {
    const history = this.load(profileId);
    if (!history) {
      return;
    }
    history.entries = [];
    this.write(profileId, history);
  }

  deleteProfile(profileId: string): void {
    if (!isSafeProfileId(profileId)) {
      return;
    }
    const history = this.profiles.get(profileId);
    if (history?.timer !== undefined) {
      this.timers.clear(history.timer);
    }
    this.profiles.delete(profileId);
    this.deletedProfiles.add(profileId);
    try {
      this.removeFile(this.fileOf(profileId));
    } catch {
      // The file is not there, or it cannot be removed. The history of a
      // deleted profile does not load again.
    }
  }

  // Writes all changes at once. The main process calls it before it quits.
  flush(): void {
    for (const [profileId, history] of this.profiles) {
      if (history.dirty) {
        this.write(profileId, history);
      }
    }
  }

  protected fileOf(profileId: string): string {
    return path.join(this.folder, `${profileId}.json`);
  }

  protected load(profileId: string): ProfileHistory | undefined {
    if (!isSafeProfileId(profileId) || this.deletedProfiles.has(profileId)) {
      return undefined;
    }
    let history = this.profiles.get(profileId);
    if (!history) {
      history = { entries: this.read(profileId), timer: undefined, dirty: false };
      this.profiles.set(profileId, history);
    }
    return history;
  }

  protected read(profileId: string): HistoryEntry[] {
    try {
      const parsed = JSON.parse(this.readFile(this.fileOf(profileId))) as { entries?: unknown };
      if (!Array.isArray(parsed.entries)) {
        return [];
      }
      return this.withoutOld(parsed.entries.filter(isEntry))
        .sort((first, second) => second.time - first.time)
        .slice(0, HISTORY_LIMIT)
        .map((entry) => ({ url: entry.url, title: entry.title, time: entry.time }));
    } catch {
      return [];
    }
  }

  protected withoutOld(entries: HistoryEntry[]): HistoryEntry[] {
    const oldest = this.now() - HISTORY_KEEP_MS;
    return entries.filter((entry) => entry.time >= oldest);
  }

  // The first change starts a timer. The changes until the timer runs go
  // into the same write.
  protected changed(profileId: string, history: ProfileHistory): void {
    history.dirty = true;
    if (history.timer === undefined) {
      history.timer = this.timers.set(() => {
        history.timer = undefined;
        if (history.dirty && this.profiles.get(profileId) === history) {
          this.write(profileId, history);
        }
      }, HISTORY_SAVE_MS);
    }
  }

  // A failed write keeps the change for the next write.
  protected write(profileId: string, history: ProfileHistory): void {
    if (history.timer !== undefined) {
      this.timers.clear(history.timer);
      history.timer = undefined;
    }
    history.entries = this.withoutOld(history.entries);
    try {
      this.writeFile(this.fileOf(profileId), JSON.stringify({ entries: history.entries }));
      history.dirty = false;
    } catch {
      history.dirty = true;
    }
  }
}
