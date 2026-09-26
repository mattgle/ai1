import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HistoryEntry } from "../common/history";
import {
  HISTORY_KEEP_MS,
  HISTORY_LIMIT,
  HISTORY_MERGE_MS,
  HISTORY_SAVE_MS,
  HistoryStore,
  HistoryTimers,
} from "./history-store";

const FOLDER = path.join("/data", "ai1-browser-history");

// Timers that run only when the test says so.
class FakeTimers implements HistoryTimers {
  protected next = 1;
  readonly pending = new Map<number, { callback: () => void; ms: number }>();

  set(callback: () => void, ms: number): unknown {
    const handle = this.next++;
    this.pending.set(handle, { callback, ms });
    return handle;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  runAll(): void {
    const due = [...this.pending.values()];
    this.pending.clear();
    for (const timer of due) {
      timer.callback();
    }
  }
}

describe("HistoryStore", () => {
  let files: Map<string, string>;
  let writes: string[];
  let removed: string[];
  let time: number;
  let timers: FakeTimers;

  beforeEach(() => {
    files = new Map();
    writes = [];
    removed = [];
    time = 1_000_000_000_000;
    timers = new FakeTimers();
  });

  function store(): HistoryStore {
    return new HistoryStore(
      FOLDER,
      () => time,
      (file, text) => {
        writes.push(file);
        files.set(file, text);
      },
      (file) => {
        const text = files.get(file);
        if (text === undefined) {
          throw new Error("There is no such file.");
        }
        return text;
      },
      (file) => {
        removed.push(file);
        files.delete(file);
      },
      timers,
    );
  }

  function fileOf(profileId: string): string {
    return path.join(FOLDER, `${profileId}.json`);
  }

  function saved(profileId: string): HistoryEntry[] {
    return (JSON.parse(files.get(fileOf(profileId)) ?? "{}") as { entries: HistoryEntry[] }).entries;
  }

  it("lists the entries newest first", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    time += HISTORY_MERGE_MS + 1;
    subject.visit("default", "https://b.example/", "B");
    assert.deepStrictEqual(
      subject.list("default").map((entry) => entry.title),
      ["B", "A"],
    );
  });

  it("updates the newest entry for a visit to the same address within 60 seconds", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "Old");
    const first = time;
    time += HISTORY_MERGE_MS;
    subject.visit("default", "https://a.example/", "New");
    const list = subject.list("default");
    assert.deepStrictEqual(list, [
      { url: "https://a.example/", title: "New", time: first + HISTORY_MERGE_MS },
    ]);
  });

  it("keeps the title when a merged visit has an empty title", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    time += 1000;
    subject.visit("default", "https://a.example/", "");
    assert.strictEqual(subject.list("default")[0].title, "A");
  });

  it("adds a new entry for a visit to the same address after 61 seconds", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    time += 61_000;
    subject.visit("default", "https://a.example/", "A");
    assert.strictEqual(subject.list("default").length, 2);
  });

  it("adds a new entry when the newest entry has another address", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    subject.visit("default", "https://b.example/", "B");
    subject.visit("default", "https://a.example/", "A");
    assert.deepStrictEqual(
      subject.list("default").map((entry) => entry.url),
      ["https://a.example/", "https://b.example/", "https://a.example/"],
    );
  });

  it("sets the title of the newest entry of the address", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "");
    time += HISTORY_MERGE_MS + 1;
    subject.visit("default", "https://b.example/", "B");
    subject.setTitle("default", "https://a.example/", "Page A");
    subject.setTitle("default", "https://c.example/", "Not visited");
    assert.deepStrictEqual(
      subject.list("default").map((entry) => entry.title),
      ["B", "Page A"],
    );
  });

  it("keeps each profile apart", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    subject.visit("p-1234abcd", "https://b.example/", "B");
    assert.deepStrictEqual(
      subject.list("default").map((entry) => entry.url),
      ["https://a.example/"],
    );
    assert.deepStrictEqual(
      subject.list("p-1234abcd").map((entry) => entry.url),
      ["https://b.example/"],
    );
  });

  it("drops the entries older than 90 days at load", () => {
    files.set(
      fileOf("default"),
      JSON.stringify({
        entries: [
          { url: "https://new.example/", title: "New", time: time - HISTORY_KEEP_MS },
          { url: "https://old.example/", title: "Old", time: time - HISTORY_KEEP_MS - 1 },
        ],
      }),
    );
    assert.deepStrictEqual(
      store()
        .list("default")
        .map((entry) => entry.url),
      ["https://new.example/"],
    );
  });

  it("drops the entries older than 90 days at each write", () => {
    const subject = store();
    subject.visit("default", "https://old.example/", "Old");
    time += HISTORY_KEEP_MS + 1;
    subject.visit("default", "https://new.example/", "New");
    subject.flush();
    assert.deepStrictEqual(
      saved("default").map((entry) => entry.url),
      ["https://new.example/"],
    );
    assert.deepStrictEqual(
      subject.list("default").map((entry) => entry.url),
      ["https://new.example/"],
    );
  });

  it("keeps at most 10 000 entries for each profile and drops the oldest", () => {
    const entries: HistoryEntry[] = [];
    for (let index = 0; index < HISTORY_LIMIT; index++) {
      entries.push({ url: `https://example.com/${index}`, title: "", time: time - index });
    }
    files.set(fileOf("default"), JSON.stringify({ entries }));
    const subject = store();
    time += HISTORY_MERGE_MS + 1;
    subject.visit("default", "https://example.com/newest", "Newest");
    const list = subject.list("default");
    assert.strictEqual(list.length, HISTORY_LIMIT);
    assert.strictEqual(list[0].url, "https://example.com/newest");
    assert.strictEqual<string>(list[list.length - 1].url, `https://example.com/${HISTORY_LIMIT - 2}`);
  });

  it("keeps at most 10 000 entries from a file with more", () => {
    const entries: HistoryEntry[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index++) {
      entries.push({ url: `https://example.com/${index}`, title: "", time: time - index });
    }
    files.set(fileOf("default"), JSON.stringify({ entries }));
    const list = store().list("default");
    assert.strictEqual(list.length, HISTORY_LIMIT);
    assert.strictEqual<string>(list[list.length - 1].url, `https://example.com/${HISTORY_LIMIT - 1}`);
  });

  it("writes at most once in 5 seconds when a page changes its address many times each second", () => {
    const subject = store();
    for (let index = 0; index < 200; index++) {
      subject.visit("default", "https://app.example/#/same", "App");
      subject.visit("default", `https://app.example/#/item-${index % 3}`, "App");
      time += 20;
    }
    assert.strictEqual(writes.length, 0);
    assert.strictEqual(timers.pending.size, 1);
    assert.deepStrictEqual(
      [...timers.pending.values()].map((timer) => timer.ms),
      [HISTORY_SAVE_MS],
    );
    timers.runAll();
    assert.deepStrictEqual(writes, [fileOf("default")]);
    subject.visit("default", "https://app.example/#/other", "App");
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(timers.pending.size, 1);
  });

  it("does not add an entry for each change to the same address within 1 minute", () => {
    const subject = store();
    for (let index = 0; index < 100; index++) {
      subject.visit("default", "https://app.example/#/same", "App");
      time += 500;
    }
    assert.strictEqual(subject.list("default").length, 1);
  });

  it("writes each profile to its own file after the delay", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    subject.visit("p-1234abcd", "https://b.example/", "B");
    assert.strictEqual(timers.pending.size, 2);
    timers.runAll();
    assert.deepStrictEqual(writes.sort(), [fileOf("default"), fileOf("p-1234abcd")].sort());
    assert.deepStrictEqual(saved("p-1234abcd"), [{ url: "https://b.example/", title: "B", time }]);
  });

  it("writes a title change after the delay", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "");
    timers.runAll();
    subject.setTitle("default", "https://a.example/", "A");
    assert.strictEqual(timers.pending.size, 1);
    timers.runAll();
    assert.strictEqual(saved("default")[0].title, "A");
  });

  it("flush writes the pending changes at once and stops the timers", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    subject.flush();
    assert.deepStrictEqual(writes, [fileOf("default")]);
    assert.strictEqual(timers.pending.size, 0);
    assert.deepStrictEqual(saved("default"), [{ url: "https://a.example/", title: "A", time }]);
    subject.flush();
    assert.strictEqual(writes.length, 1);
  });

  it("reads the file of an earlier run", () => {
    const first = store();
    first.visit("default", "https://a.example/", "A");
    first.flush();
    assert.deepStrictEqual(store().list("default"), [{ url: "https://a.example/", title: "A", time }]);
  });

  it("clear removes all entries of the profile and writes at once", () => {
    const subject = store();
    subject.visit("default", "https://a.example/", "A");
    subject.visit("p-1234abcd", "https://b.example/", "B");
    subject.clear("default");
    assert.deepStrictEqual(subject.list("default"), []);
    assert.deepStrictEqual(saved("default"), []);
    assert.strictEqual(subject.list("p-1234abcd").length, 1);
    timers.runAll();
    assert.deepStrictEqual(saved("default"), []);
  });

  it("deleteProfile removes the file and the pending write of the profile", () => {
    const subject = store();
    subject.visit("p-1234abcd", "https://b.example/", "B");
    subject.flush();
    subject.visit("p-1234abcd", "https://c.example/", "C");
    subject.deleteProfile("p-1234abcd");
    assert.deepStrictEqual(removed, [fileOf("p-1234abcd")]);
    assert.strictEqual(files.has(fileOf("p-1234abcd")), false);
    assert.strictEqual(timers.pending.size, 0);
    subject.flush();
    assert.strictEqual(files.has(fileOf("p-1234abcd")), false);
    assert.deepStrictEqual(subject.list("p-1234abcd"), []);
  });

  it("records nothing for a deleted profile when a late navigation comes", () => {
    const subject = store();
    subject.deleteProfile("p-1234abcd");
    subject.visit("p-1234abcd", "https://late.example/", "Late");
    subject.flush();
    timers.runAll();
    assert.strictEqual(files.has(fileOf("p-1234abcd")), false);
    assert.deepStrictEqual(subject.list("p-1234abcd"), []);
  });

  it("gives an empty history for a file with bad JSON or bad entries", () => {
    files.set(fileOf("default"), "{ not json");
    assert.deepStrictEqual(store().list("default"), []);
    files.set(fileOf("default"), JSON.stringify({ entries: "no" }));
    assert.deepStrictEqual(store().list("default"), []);
    files.set(
      fileOf("default"),
      JSON.stringify({
        entries: [
          { url: "https://a.example/", title: "A", time },
          { url: 3, title: "B", time },
          { url: "https://c.example/", time },
          null,
        ],
      }),
    );
    assert.deepStrictEqual(store().list("default"), [{ url: "https://a.example/", title: "A", time }]);
  });

  it("does nothing for a profile id that is not a safe file name", () => {
    const subject = store();
    for (const profileId of ["../evil", "a/b", "", "UPPER", "x".repeat(41)]) {
      subject.visit(profileId, "https://a.example/", "A");
      subject.clear(profileId);
      subject.deleteProfile(profileId);
      assert.deepStrictEqual(subject.list(profileId), [], profileId);
    }
    subject.flush();
    assert.deepStrictEqual(writes, []);
    assert.deepStrictEqual(removed, []);
  });

  it("keeps the pending changes when a write fails", () => {
    let fail = true;
    const subject = new HistoryStore(
      FOLDER,
      () => time,
      (file, text) => {
        if (fail) {
          throw new Error("The disk is full.");
        }
        files.set(file, text);
      },
      () => {
        throw new Error("There is no such file.");
      },
      () => undefined,
      timers,
    );
    subject.visit("default", "https://a.example/", "A");
    assert.doesNotThrow(() => timers.runAll());
    fail = false;
    subject.flush();
    assert.deepStrictEqual(saved("default"), [{ url: "https://a.example/", title: "A", time }]);
  });

  it("uses the real files and a timer that does not keep the process alive", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-history-"));
    try {
      const subject = new HistoryStore(path.join(folder, "ai1-browser-history"));
      subject.visit("default", "https://a.example/", "A");
      const file = path.join(folder, "ai1-browser-history", "default.json");
      assert.strictEqual(fs.existsSync(file), false);
      subject.flush();
      assert.deepStrictEqual(
        new HistoryStore(path.join(folder, "ai1-browser-history")).list("default").length,
        1,
      );
      assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["default.json"]);
      subject.visit("default", "https://b.example/", "B");
      subject.deleteProfile("default");
      assert.strictEqual(fs.existsSync(file), false);
      subject.visit("default", "https://c.example/", "C");
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
