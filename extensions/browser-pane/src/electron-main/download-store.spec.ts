import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DownloadEntry } from "../common/downloads";
import { DOWNLOAD_LIMIT, DownloadStore } from "./download-store";

function entry(id: string, change: Partial<DownloadEntry> = {}): DownloadEntry {
  return {
    id,
    fileName: `${id}.txt`,
    savePath: `/downloads/${id}.txt`,
    url: `https://example.com/${id}.txt`,
    profileId: "default",
    totalBytes: 100,
    receivedBytes: 100,
    startTime: 1000,
    state: "completed",
    ...change,
  };
}

describe("DownloadStore", () => {
  let folder: string;
  let file: string;
  let existing: Set<string>;
  let time: number;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-downloads-"));
    file = path.join(folder, "ai1-browser-downloads.json");
    existing = new Set();
    time = 10_000;
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function store(): DownloadStore {
    const created = new DownloadStore(
      file,
      (candidate) => existing.has(candidate),
      () => time,
    );
    created.load();
    return created;
  }

  function savedIds(): string[] {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { downloads: DownloadEntry[] };
    return saved.downloads.map((saved) => saved.id);
  }

  it("keeps the newest entry first", () => {
    const subject = store();
    subject.add(entry("a"));
    subject.add(entry("b"));
    assert.deepStrictEqual(
      subject.list().map((listed) => listed.id),
      ["b", "a"],
    );
    assert.deepStrictEqual(
      store()
        .list()
        .map((listed) => listed.id),
      ["b", "a"],
    );
  });

  it("drops the oldest entry above the limit of 100", () => {
    const subject = store();
    for (let index = 0; index <= DOWNLOAD_LIMIT; index++) {
      subject.add(entry(`e${index}`));
    }
    const ids = subject.list().map((listed) => listed.id);
    assert.strictEqual(DOWNLOAD_LIMIT, 100);
    assert.strictEqual(ids.length, 100);
    assert.strictEqual(ids[0], "e100");
    assert.ok(!ids.includes("e0"));
    assert.strictEqual(store().list().length, 100);
  });

  it("changes an entry in progress to failed when it loads", () => {
    store().add(entry("a", { state: "progressing", receivedBytes: 10 }));
    const [loaded] = store().list();
    assert.strictEqual(loaded.state, "failed");
    assert.strictEqual(loaded.error, "AI1 closed during the download.");
  });

  it("starts empty when the file is not JSON", () => {
    fs.writeFileSync(file, "not json");
    assert.deepStrictEqual(store().list(), []);
  });

  it("starts empty when the file has no list", () => {
    fs.writeFileSync(file, JSON.stringify({ downloads: "no" }));
    assert.deepStrictEqual(store().list(), []);
  });

  it("ignores a saved entry with a bad shape", () => {
    fs.writeFileSync(file, JSON.stringify({ downloads: [entry("a"), { id: 3 }, null] }));
    assert.deepStrictEqual(
      store()
        .list()
        .map((listed) => listed.id),
      ["a"],
    );
  });

  it("clearFinished keeps the entries in progress", () => {
    const subject = store();
    subject.add(entry("done"));
    subject.add(entry("running", { state: "progressing" }));
    subject.add(entry("stopped", { state: "cancelled" }));
    subject.add(entry("broken", { state: "failed", error: "Network" }));
    subject.add(entry("gone", { state: "deleted" }));
    subject.clearFinished();
    assert.deepStrictEqual(
      subject.list().map((listed) => listed.id),
      ["running"],
    );
    assert.deepStrictEqual(savedIds(), ["running"]);
  });

  it("refreshDeleted marks a completed entry whose file is gone", () => {
    const subject = store();
    existing.add("/downloads/here.txt");
    subject.add(entry("here"));
    subject.add(entry("gone"));
    subject.add(entry("running", { state: "progressing" }));
    subject.add(entry("stopped", { state: "cancelled" }));
    subject.refreshDeleted();
    const states = Object.fromEntries(subject.list().map((listed) => [listed.id, listed.state]));
    assert.deepStrictEqual(states, {
      here: "completed",
      gone: "deleted",
      running: "progressing",
      stopped: "cancelled",
    });
    assert.strictEqual(
      store()
        .list()
        .find((listed) => listed.id === "gone")?.state,
      "deleted",
    );
  });

  it("removes one entry", () => {
    const subject = store();
    subject.add(entry("a"));
    subject.add(entry("b"));
    subject.remove("a");
    assert.deepStrictEqual(savedIds(), ["b"]);
  });

  it("writes a state change at once", () => {
    const subject = store();
    subject.add(entry("a", { state: "progressing", receivedBytes: 0 }));
    subject.update("a", { state: "completed", receivedBytes: 100 });
    assert.strictEqual(store().list()[0].state, "completed");
  });

  it("writes progress at most once in 2 seconds", () => {
    const subject = store();
    subject.add(entry("a", { state: "progressing", receivedBytes: 0 }));
    time += 2000;
    subject.update("a", { receivedBytes: 10 });
    assert.strictEqual(store().list()[0].receivedBytes, 10);
    time += 1000;
    subject.update("a", { receivedBytes: 20 });
    assert.strictEqual(store().list()[0].receivedBytes, 10);
    assert.strictEqual(subject.list()[0].receivedBytes, 20);
    time += 1000;
    subject.update("a", { receivedBytes: 30 });
    assert.strictEqual(store().list()[0].receivedBytes, 30);
  });

  it("does not let an update change the id", () => {
    const subject = store();
    subject.add(entry("a"));
    subject.update("a", { id: "b" } as Partial<DownloadEntry>);
    assert.strictEqual(subject.list()[0].id, "a");
  });

  it("gives copies, so a caller cannot change the store", () => {
    const subject = store();
    subject.add(entry("a"));
    subject.list()[0].state = "failed";
    assert.strictEqual(subject.list()[0].state, "completed");
  });
});
