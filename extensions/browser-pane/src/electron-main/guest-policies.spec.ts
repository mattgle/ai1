import * as assert from "node:assert";
import type { WebContents } from "@theia/core/electron-shared/electron";
import { Channels } from "../common/browser-ipc";
import { GuestPolicies } from "./guest-policies";
import { GuestRegistry } from "./guest-registry";

type Listener = (...args: unknown[]) => void;

interface Sent {
  channel: string;
  payload: unknown;
}

// A web contents with only the parts that `GuestPolicies` uses.
class FakeContents {
  readonly listeners = new Map<string, Listener[]>();
  readonly sent: Sent[] = [];
  // The messages sent to this web contents itself (a Theia window).
  readonly ownSent: Sent[] = [];
  openHandler: ((details: { url: string; disposition: string }) => { action: string }) | undefined;
  reloads = 0;
  readonly hostWebContents: { isDestroyed(): boolean; send(channel: string, payload: unknown): void };
  readonly session: { storagePath: string | null };

  constructor(
    readonly id: number,
    storagePath: string | null,
    private readonly type = "webview",
  ) {
    this.session = { storagePath };
    this.hostWebContents = {
      isDestroyed: () => false,
      send: (channel, payload) => this.sent.push({ channel, payload }),
    };
  }

  getType(): string {
    return this.type;
  }

  isDestroyed(): boolean {
    return false;
  }

  reload(): void {
    this.reloads++;
  }

  send(channel: string, payload: unknown): void {
    this.ownSent.push({ channel, payload });
  }

  setBackgroundThrottling(): void {
    return undefined;
  }

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  setWindowOpenHandler(handler: FakeContents["openHandler"]): void {
    this.openHandler = handler;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

class TestGuestPolicies extends GuestPolicies {
  readonly contents = new Map<number, FakeContents>();
  time = 0;

  constructor(registry = new GuestRegistry()) {
    super();
    this.registry = registry;
  }

  get acceptedHosts(): Set<string> {
    return this.acceptedCertificateHosts;
  }

  protected override contentsFromId(id: number): WebContents | undefined {
    return this.contents.get(id) as unknown as WebContents | undefined;
  }

  protected override now(): number {
    return this.time;
  }

  // The Theia window that gets a message when the page has no embedder.
  fallbackWindow: FakeContents | undefined;

  protected override theiaWindowContents(): WebContents | undefined {
    return this.fallbackWindow as unknown as WebContents | undefined;
  }
}

const AI1_PATH = "/data/Partitions/ai1-browser-default";

function asContents(fake: FakeContents): WebContents {
  return fake as unknown as WebContents;
}

describe("GuestPolicies.isAi1BrowserContents", () => {
  it("is true for a page in the partition folder of an AI1 profile", () => {
    const policies = new GuestPolicies();
    assert.strictEqual(policies.isAi1BrowserContents(asContents(new FakeContents(1, AI1_PATH))), true);
    assert.strictEqual(
      policies.isAi1BrowserContents(asContents(new FakeContents(2, AI1_PATH, "window"))),
      true,
    );
  });

  it("is false for a webview page in another session", () => {
    const policies = new GuestPolicies();
    for (const storagePath of ["/data/Partitions/other", "/x/ai1-browser-default", "/data", null]) {
      const contents = asContents(new FakeContents(1, storagePath));
      assert.strictEqual(policies.isAi1BrowserContents(contents), false, String(storagePath));
    }
  });
});

describe("GuestPolicies.attach", () => {
  it("refuses each nested page that a guest tries to attach", () => {
    const policies = new GuestPolicies();
    const guest = new FakeContents(1, AI1_PATH);
    policies.attach(asContents(guest));
    let prevented = 0;
    guest.emit(
      "will-attach-webview",
      { preventDefault: () => prevented++ },
      {},
      { src: "https://example.com/", partition: "persist:ai1-browser-default" },
    );
    assert.strictEqual(prevented, 1);
  });

  it("records the navigations of the page in the history, except while an agent is connected", () => {
    const policies = new GuestPolicies();
    const visits: string[] = [];
    policies.setHistory({
      visit: (profileId, url) => visits.push(`${profileId} ${url}`),
      setTitle: () => undefined,
    });
    let connected = false;
    policies.setAgentConnectedCheck((guestId) => connected && guestId === 1);
    const guest = new FakeContents(1, AI1_PATH);
    policies.attach(asContents(guest));
    guest.emit("did-navigate", {}, "https://example.com/a", 200, "OK");
    connected = true;
    guest.emit("did-navigate", {}, "https://example.com/b", 200, "OK");
    assert.deepStrictEqual(visits, ["default https://example.com/a"]);
  });

  it("opens at most five popups in ten seconds and gives one notice for each burst", () => {
    const policies = new TestGuestPolicies();
    const guest = new FakeContents(1, AI1_PATH);
    policies.attach(asContents(guest));
    const open = (url: string, disposition = "foreground-tab") => guest.openHandler!({ url, disposition });
    const opened = () => guest.sent.filter((sent) => sent.channel === Channels.openTab).length;
    const notices = () => guest.sent.filter((sent) => sent.channel === Channels.notice);

    policies.time = 1000;
    for (let index = 0; index < 4; index++) {
      open(`https://example.com/${index}`);
    }
    assert.strictEqual(open("https://example.com/w", "new-window").action, "allow");
    assert.strictEqual(opened(), 4);
    for (let index = 0; index < 3; index++) {
      assert.strictEqual(open(`https://example.com/more-${index}`).action, "deny");
    }
    assert.strictEqual(opened(), 4);
    assert.deepStrictEqual(
      notices().map((sent) => sent.payload),
      ["A page tried to open too many popups. AI1 blocked the rest."],
    );

    policies.time = 11_000;
    open("https://example.com/later");
    assert.strictEqual(opened(), 5);

    policies.time = 11_500;
    for (let index = 0; index < 5; index++) {
      open(`https://example.com/again-${index}`);
    }
    assert.strictEqual(opened(), 9);
    assert.strictEqual(notices().length, 2);
  });

  it("does not count a refused address as a popup", () => {
    const policies = new TestGuestPolicies();
    const guest = new FakeContents(1, AI1_PATH);
    policies.attach(asContents(guest));
    for (let index = 0; index < 10; index++) {
      guest.openHandler!({ url: "file:///etc/hosts", disposition: "foreground-tab" });
    }
    guest.openHandler!({ url: "https://example.com/", disposition: "foreground-tab" });
    assert.strictEqual(guest.sent.filter((sent) => sent.channel === Channels.openTab).length, 1);
    assert.strictEqual(guest.sent.filter((sent) => sent.channel === Channels.notice).length, 0);
  });
});

describe("GuestPolicies.acceptCertificate", () => {
  it("accepts a local host for an AI1 page and reloads it", () => {
    const policies = new TestGuestPolicies();
    const guest = new FakeContents(5, AI1_PATH);
    policies.contents.set(5, guest);
    policies.acceptCertificate(5, "127.0.0.1");
    assert.deepStrictEqual([...policies.acceptedHosts], ["127.0.0.1"]);
    assert.strictEqual(guest.reloads, 1);
  });

  it("does nothing for a web contents that does not exist", () => {
    const policies = new TestGuestPolicies();
    policies.acceptCertificate(5, "127.0.0.1");
    assert.strictEqual(policies.acceptedHosts.size, 0);
  });

  it("does nothing for a web contents that is not an AI1 page", () => {
    const policies = new TestGuestPolicies();
    const other = new FakeContents(5, "/data/Partitions/other");
    policies.contents.set(5, other);
    policies.acceptCertificate(5, "127.0.0.1");
    assert.strictEqual(policies.acceptedHosts.size, 0);
    assert.strictEqual(other.reloads, 0);
  });

  it("does nothing for a host that is not local", () => {
    const policies = new TestGuestPolicies();
    const guest = new FakeContents(5, AI1_PATH);
    policies.contents.set(5, guest);
    policies.acceptCertificate(5, "example.com");
    assert.strictEqual(policies.acceptedHosts.size, 0);
    assert.strictEqual(guest.reloads, 0);
  });
});

describe("GuestPolicies shortcuts", () => {
  const WINDOW_ID = 7;

  function setup() {
    const registry = new GuestRegistry();
    const policies = new TestGuestPolicies(registry);
    const window = new FakeContents(WINDOW_ID, null, "window");
    const windowSent: Sent[] = [];
    (window as unknown as { send(channel: string, payload: unknown): void }).send = (channel, payload) =>
      windowSent.push({ channel, payload });
    policies.contents.set(WINDOW_ID, window);
    const guest = new FakeContents(3, AI1_PATH);
    registry.register(3, "tab-1", WINDOW_ID);
    policies.attach(asContents(guest));
    const press = (input: Partial<{ type: string; key: string; meta: boolean; shift: boolean }>) => {
      let prevented = false;
      guest.emit(
        "before-input-event",
        { preventDefault: () => (prevented = true) },
        { type: "keyDown", key: "", meta: false, control: false, shift: false, alt: false, ...input },
      );
      return prevented;
    };
    const shortcuts = () => windowSent.filter((sent) => sent.channel === Channels.shortcut);
    return { policies, registry, guest, press, shortcuts };
  }

  it("stops a shortcut and sends it with the tab id to the window of the tab", () => {
    const { press, shortcuts } = setup();
    assert.strictEqual(press({ key: "f", meta: true }), true);
    assert.deepStrictEqual(
      shortcuts().map((sent) => sent.payload),
      [{ tabId: "tab-1", shortcut: "find" }],
    );
  });

  it("does not stop other keys or a keyUp", () => {
    const { press, shortcuts } = setup();
    assert.strictEqual(press({ key: "a", meta: true }), false);
    assert.strictEqual(press({ type: "keyUp", key: "f", meta: true }), false);
    assert.strictEqual(shortcuts().length, 0);
  });

  it("stops Escape only while the find bar of the guest is open", () => {
    const { policies, press, shortcuts } = setup();
    assert.strictEqual(press({ key: "Escape" }), false);
    policies.setFindOpen(3, true);
    assert.strictEqual(press({ key: "Escape" }), true);
    policies.setFindOpen(3, false);
    assert.strictEqual(press({ key: "Escape" }), false);
    assert.deepStrictEqual(
      shortcuts().map((sent) => sent.payload),
      [{ tabId: "tab-1", shortcut: "closeFind" }],
    );
  });

  it("catches no key on a guest with a connected agent", () => {
    const { policies, press, shortcuts } = setup();
    const connected = new Set<number>([3]);
    policies.setAgentConnectedCheck((guestId) => connected.has(guestId));
    policies.setFindOpen(3, true);
    assert.strictEqual(press({ key: "f", meta: true }), false);
    assert.strictEqual(press({ key: "Escape" }), false);
    assert.strictEqual(shortcuts().length, 0);
    connected.delete(3);
    assert.strictEqual(press({ key: "f", meta: true }), true);
  });

  it("catches no key on a page that is not a browser tab, for example a popup window", () => {
    const { registry, press, shortcuts } = setup();
    registry.forget(3);
    assert.strictEqual(press({ key: "f", meta: true }), false);
    assert.strictEqual(shortcuts().length, 0);
  });

  it("forgets the find bar state when the guest is destroyed", () => {
    const { policies, guest, press } = setup();
    policies.setFindOpen(3, true);
    guest.emit("destroyed");
    assert.strictEqual(press({ key: "Escape" }), false);
  });
});

describe("GuestPolicies.sendToWindowOf", () => {
  it("sends to the embedder of a live page", () => {
    const policies = new TestGuestPolicies();
    const guest = new FakeContents(1, AI1_PATH);
    policies.sendToWindowOf(asContents(guest), Channels.downloadDone, "done");
    assert.deepStrictEqual(guest.sent, [{ channel: Channels.downloadDone, payload: "done" }]);
  });

  it("sends to a Theia window, and does not throw, when the page is destroyed", () => {
    const policies = new TestGuestPolicies();
    const window = new FakeContents(2, null, "window");
    policies.fallbackWindow = window;
    const destroyed = {
      id: 1,
      isDestroyed: () => true,
      get hostWebContents(): never {
        throw new Error("Object has been destroyed");
      },
    };
    assert.doesNotThrow(() =>
      policies.sendToWindowOf(destroyed as unknown as WebContents, Channels.downloadDone, "done"),
    );
    assert.deepStrictEqual(window.ownSent, [{ channel: Channels.downloadDone, payload: "done" }]);
  });
});
