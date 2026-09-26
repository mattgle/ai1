import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DownloadDone, DownloadEntry } from "../common/downloads";
import { DownloadStore } from "./download-store";
import { DownloadTracker } from "./download-tracker";

class FakeItem extends EventEmitter {
  savePath = "";
  cancelled = false;
  received = 0;

  getFilename(): string {
    return "report.pdf";
  }

  getURL(): string {
    return "https://example.com/report.pdf";
  }

  getTotalBytes(): number {
    return 1000;
  }

  getReceivedBytes(): number {
    return this.received;
  }

  setSavePath(savePath: string): void {
    this.savePath = savePath;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

describe("DownloadTracker", () => {
  let folder: string;
  let time: number;
  let broadcasts: DownloadEntry[][];
  let done: DownloadDone[];
  let store: DownloadStore;
  let tracker: DownloadTracker;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-download-tracker-"));
    time = 50_000;
    broadcasts = [];
    done = [];
    store = new DownloadStore(
      path.join(folder, "ai1-browser-downloads.json"),
      () => true,
      () => time,
    );
    store.load();
    let counter = 0;
    tracker = new DownloadTracker(
      store,
      (entries) => broadcasts.push(entries),
      () => time,
      () => `id${++counter}`,
    );
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function start(item: FakeItem): string {
    return tracker.start(item, "/downloads/report (1).pdf", "agent", (event) => done.push(event));
  }

  it("adds an entry in progress with the unique name and sends the list", () => {
    const item = new FakeItem();
    const id = start(item);
    assert.strictEqual(id, "id1");
    assert.strictEqual(item.savePath, "/downloads/report (1).pdf");
    assert.deepStrictEqual(store.list(), [
      {
        id: "id1",
        fileName: "report (1).pdf",
        savePath: "/downloads/report (1).pdf",
        url: "https://example.com/report.pdf",
        profileId: "agent",
        totalBytes: 1000,
        receivedBytes: 0,
        startTime: 50_000,
        state: "progressing",
      },
    ]);
    assert.strictEqual(broadcasts.length, 1);
  });

  it("sends progress at most once in 500 ms", () => {
    const item = new FakeItem();
    start(item);
    item.received = 100;
    time += 500;
    item.emit("updated", {}, "progressing");
    time += 100;
    item.received = 200;
    item.emit("updated", {}, "progressing");
    assert.strictEqual(broadcasts.length, 2);
    assert.strictEqual(broadcasts[1][0].receivedBytes, 100);
    assert.strictEqual(store.list()[0].receivedBytes, 200);
    time += 400;
    item.emit("updated", {}, "progressing");
    assert.strictEqual(broadcasts.length, 3);
  });

  it("sends the done state at once and tells the window", () => {
    const item = new FakeItem();
    const id = start(item);
    item.received = 1000;
    item.emit("done", {}, "completed");
    assert.strictEqual(store.list()[0].state, "completed");
    assert.strictEqual(store.list()[0].receivedBytes, 1000);
    assert.strictEqual(broadcasts.length, 2);
    assert.strictEqual(broadcasts[1][0].state, "completed");
    assert.deepStrictEqual(done, [{ id, fileName: "report (1).pdf", state: "completed" }]);
  });

  it("sets cancelled and failed", () => {
    const first = new FakeItem();
    const second = new FakeItem();
    start(first);
    start(second);
    first.emit("done", {}, "cancelled");
    second.emit("done", {}, "interrupted");
    const states = Object.fromEntries(
      store.list().map((listed) => [listed.id, [listed.state, listed.error]]),
    );
    assert.deepStrictEqual(states, {
      id1: ["cancelled", undefined],
      id2: ["failed", "The download was interrupted."],
    });
  });

  it("cancels a running download and forgets the item when it is done", () => {
    const item = new FakeItem();
    const id = start(item);
    assert.strictEqual(tracker.isRunning(id), true);
    tracker.cancel(id);
    assert.strictEqual(item.cancelled, true);
    item.emit("done", {}, "cancelled");
    assert.strictEqual(tracker.isRunning(id), false);
    item.cancelled = false;
    tracker.cancel(id);
    assert.strictEqual(item.cancelled, false);
  });

  it("does not add a progress update after a done state", () => {
    const item = new FakeItem();
    start(item);
    item.emit("done", {}, "completed");
    time += 1000;
    item.emit("updated", {}, "progressing");
    assert.strictEqual(broadcasts.length, 2);
    assert.strictEqual(store.list()[0].state, "completed");
  });
});
