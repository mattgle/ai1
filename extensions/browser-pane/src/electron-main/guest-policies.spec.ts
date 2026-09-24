import * as assert from "node:assert";
import type { WebContents } from "@theia/core/electron-shared/electron";
import { Channels } from "../common/browser-ipc";
import { GuestPolicies } from "./guest-policies";

type Listener = (...args: unknown[]) => void;

interface Sent {
  channel: string;
  payload: unknown;
}

// A web contents with only the parts that `GuestPolicies` uses.
class FakeContents {
  readonly listeners = new Map<string, Listener[]>();
  readonly sent: Sent[] = [];
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

  get acceptedHosts(): Set<string> {
    return this.acceptedCertificateHosts;
  }

  protected override contentsFromId(id: number): WebContents | undefined {
    return this.contents.get(id) as unknown as WebContents | undefined;
  }

  protected override now(): number {
    return this.time;
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
