import * as assert from "node:assert";
import type { WebContents } from "@theia/core/electron-shared/electron";
import { HistoryRecorder, HistorySink } from "./history-recorder";

type Listener = (...args: unknown[]) => void;

// A web contents with only the parts that `HistoryRecorder` uses.
class FakeContents {
  readonly listeners = new Map<string, Listener[]>();
  readonly session: { storagePath: string | null };
  url = "";
  title = "";

  constructor(
    readonly id: number,
    storagePath: string | null,
  ) {
    this.session = { storagePath };
  }

  getURL(): string {
    return this.url;
  }

  getTitle(): string {
    return this.title;
  }

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({}, ...args);
    }
  }
}

class FakeHistory implements HistorySink {
  readonly calls: string[] = [];

  visit(profileId: string, url: string, title: string): void {
    this.calls.push(`visit ${profileId} ${url} ${title}`);
  }

  setTitle(profileId: string, url: string, title: string): void {
    this.calls.push(`title ${profileId} ${url} ${title}`);
  }
}

const DEFAULT_PATH = "/data/Partitions/ai1-browser-default";

describe("HistoryRecorder", () => {
  let history: FakeHistory;
  let connected: Set<number>;

  beforeEach(() => {
    history = new FakeHistory();
    connected = new Set();
  });

  function attach(storagePath: string | null = DEFAULT_PATH): FakeContents {
    const contents = new FakeContents(7, storagePath);
    new HistoryRecorder(history, (guestId) => connected.has(guestId)).attach(
      contents as unknown as WebContents,
    );
    return contents;
  }

  it("records a main frame navigation with an empty title", () => {
    const contents = attach();
    contents.emit("did-navigate", "https://a.example/", 200, "OK");
    assert.deepStrictEqual(history.calls, ["visit default https://a.example/ "]);
  });

  it("records an in-page navigation of the main frame with the current title", () => {
    const contents = attach();
    contents.title = "App";
    contents.emit("did-navigate-in-page", "https://app.example/#/a", true, 1, 1);
    contents.emit("did-navigate-in-page", "https://frame.example/#/b", false, 1, 2);
    assert.deepStrictEqual(history.calls, ["visit default https://app.example/#/a App"]);
  });

  it("sets the title for the current address", () => {
    const contents = attach();
    contents.url = "https://a.example/";
    contents.emit("page-title-updated", "Page A", true);
    assert.deepStrictEqual(history.calls, ["title default https://a.example/ Page A"]);
  });

  it("uses the profile of the session", () => {
    const contents = attach("/data/Partitions/ai1-browser-p-1234abcd");
    contents.emit("did-navigate", "https://a.example/", 200, "OK");
    assert.deepStrictEqual(history.calls, ["visit p-1234abcd https://a.example/ "]);
  });

  it("records nothing for a page that is not http or https", () => {
    const contents = attach();
    contents.emit("did-navigate", "about:blank", 200, "OK");
    contents.emit("did-navigate", "data:text/html,error", 200, "OK");
    contents.url = "about:blank";
    contents.emit("page-title-updated", "Blank", true);
    assert.deepStrictEqual(history.calls, []);
  });

  it("records nothing in the Agent profile", () => {
    const contents = attach("/data/Partitions/ai1-browser-agent");
    contents.url = "https://a.example/";
    contents.emit("did-navigate", "https://a.example/", 200, "OK");
    contents.emit("did-navigate-in-page", "https://a.example/#x", true, 1, 1);
    contents.emit("page-title-updated", "A", true);
    assert.deepStrictEqual(history.calls, []);
  });

  it("records nothing while an agent is connected to the page", () => {
    const contents = attach();
    connected.add(7);
    contents.url = "https://a.example/";
    contents.emit("did-navigate", "https://a.example/", 200, "OK");
    contents.emit("did-navigate-in-page", "https://a.example/#x", true, 1, 1);
    contents.emit("page-title-updated", "A", true);
    connected.delete(7);
    contents.emit("did-navigate", "https://b.example/", 200, "OK");
    assert.deepStrictEqual(history.calls, ["visit default https://b.example/ "]);
  });

  it("records nothing for a page that is not in an AI1 profile", () => {
    const contents = attach("/data/Partitions/other");
    contents.emit("did-navigate", "https://a.example/", 200, "OK");
    assert.deepStrictEqual(history.calls, []);
    assert.strictEqual(contents.listeners.size, 0);
  });
});
