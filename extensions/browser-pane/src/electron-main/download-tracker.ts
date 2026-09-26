import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { DownloadDone, DownloadEntry, DownloadState, ProgressThrottle } from "../common/downloads";
import { DownloadStore } from "./download-store";

const PROGRESS_INTERVAL_MS = 500;
const INTERRUPTED = "The download was interrupted.";

// The part of Electron's `DownloadItem` that the tracker uses. A test gives a
// fake item.
export interface TrackedDownloadItem {
  getURL(): string;
  getTotalBytes(): number;
  getReceivedBytes(): number;
  setSavePath(path: string): void;
  on(event: "updated", listener: () => void): unknown;
  once(
    event: "done",
    listener: (event: unknown, state: "completed" | "cancelled" | "interrupted") => void,
  ): unknown;
  cancel(): void;
}

// Keeps the running downloads and writes their entries to the store. It
// sends the full list on each state change at once, and on progress at most
// once in 500 ms for each download. It has no `electron` import, so plain
// mocha tests it.
export class DownloadTracker {
  protected readonly items = new Map<string, TrackedDownloadItem>();
  protected readonly throttle: ProgressThrottle;

  constructor(
    protected readonly store: DownloadStore,
    protected readonly changed: (entries: DownloadEntry[]) => void,
    protected readonly now: () => number = Date.now,
    protected readonly newId: () => string = () => randomBytes(8).toString("hex"),
  ) {
    this.throttle = new ProgressThrottle(PROGRESS_INTERVAL_MS, now);
  }

  // `savePath` has the unique name in the downloads folder. `onDone` tells
  // the window of the page.
  start(
    item: TrackedDownloadItem,
    savePath: string,
    profileId: string,
    onDone: (done: DownloadDone) => void,
  ): string {
    item.setSavePath(savePath);
    const id = this.newId();
    const fileName = path.basename(savePath);
    this.items.set(id, item);
    this.store.add({
      id,
      fileName,
      savePath,
      url: item.getURL(),
      profileId,
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      startTime: this.now(),
      state: "progressing",
    });
    this.throttle.shouldSend(id);
    this.changed(this.store.list());
    item.on("updated", () => {
      if (!this.items.has(id)) {
        return;
      }
      this.store.update(id, { totalBytes: item.getTotalBytes(), receivedBytes: item.getReceivedBytes() });
      if (this.throttle.shouldSend(id)) {
        this.changed(this.store.list());
      }
    });
    item.once("done", (_event, doneState) => {
      this.items.delete(id);
      this.throttle.forget(id);
      const state: DownloadState =
        doneState === "completed" ? "completed" : doneState === "cancelled" ? "cancelled" : "failed";
      this.store.update(id, {
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
        state,
        ...(state === "failed" ? { error: INTERRUPTED } : {}),
      });
      this.changed(this.store.list());
      onDone({ id, fileName, state });
    });
    return id;
  }

  isRunning(id: string): boolean {
    return this.items.has(id);
  }

  cancel(id: string): void {
    this.items.get(id)?.cancel();
  }
}
