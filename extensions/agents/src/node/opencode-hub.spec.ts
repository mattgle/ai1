import * as assert from "node:assert";
import { FakeOpenCodeServer } from "./fake-opencode-server";
import { OpenCodeClient } from "./opencode-client";
import { OpenCodeHub } from "./opencode-hub";

describe("OpenCodeHub", () => {
  let server: FakeOpenCodeServer;
  let hub: OpenCodeHub;
  let connects: number;
  let baseUrl: string;

  beforeEach(async () => {
    server = new FakeOpenCodeServer();
    baseUrl = await server.start();
    connects = 0;
    hub = new OpenCodeHub();
    hub.init(
      () => {
        connects += 1;
        return Promise.resolve(new OpenCodeClient({ baseUrl, password: server.password }));
      },
      { retryMs: 20 },
    );
  });

  afterEach(async () => {
    hub.dispose();
    await server.stop();
  });

  it("connects once, even when apiClient is called more than once, from more than one caller", async () => {
    const [a, b] = await Promise.all([hub.apiClient(), hub.apiClient()]);
    assert.strictEqual(a, b);
    await hub.apiClient();
    assert.strictEqual(connects, 1);
  });

  it("tries to connect again after a failed connect", async () => {
    let attempts = 0;
    const retrying = new OpenCodeHub();
    retrying.init(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("OpenCode is not running"))
        : Promise.resolve(new OpenCodeClient({ baseUrl, password: server.password }));
    });
    try {
      await assert.rejects(retrying.apiClient(), /not running/);
      await retrying.apiClient();
      assert.strictEqual(attempts, 2);
    } finally {
      retrying.dispose();
    }
  });

  it("fans one event out to every registered listener", async () => {
    await hub.apiClient();
    const seenA: string[] = [];
    const seenB: string[] = [];
    hub.onEvent((type) => seenA.push(type));
    hub.onEvent((type) => seenB.push(type));
    await waitConnected(hub);
    server.pushEvent("session.execution.started", { sessionID: "ses_a" });
    await until(
      () => seenA.includes("session.execution.started") && seenB.includes("session.execution.started"),
    );
  });

  it("disposing one event listener does not stop another", async () => {
    await hub.apiClient();
    const seenA: string[] = [];
    const seenB: string[] = [];
    const subscriptionA = hub.onEvent((type) => seenA.push(type));
    hub.onEvent((type) => seenB.push(type));
    subscriptionA.dispose();
    await waitConnected(hub);
    server.pushEvent("session.execution.started", { sessionID: "ses_a" });
    await until(() => seenB.includes("session.execution.started"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepStrictEqual(seenA, []);
  });

  it("gives a late-joining state listener the current connection state at once", async () => {
    await hub.apiClient();
    const early: boolean[] = [];
    hub.onState((connected) => early.push(connected));
    await until(() => early.includes(true));
    // A listener registered after the connection is already up gets that
    // current state immediately, synchronously, not only on the next change.
    const late: boolean[] = [];
    hub.onState((connected) => late.push(connected));
    assert.deepStrictEqual(late, [true]);
  });

  it("disposing one state listener does not stop another", async () => {
    await hub.apiClient();
    const stateA: boolean[] = [];
    const stateB: boolean[] = [];
    const subscriptionA = hub.onState((connected) => stateA.push(connected));
    hub.onState((connected) => stateB.push(connected));
    await until(() => stateA.includes(true) && stateB.includes(true));
    subscriptionA.dispose();
    server.dropStreams();
    await until(() => stateB.includes(false));
    // The disposed listener saw no further state changes after it disposed.
    const stateACountAtDispose = stateA.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(stateA.length, stateACountAtDispose);
  });
});

// Waits for the hub's underlying subscription to actually be up, through a
// throwaway state listener, so a test's own `pushEvent` right after does
// not race the fake server's own `GET /api/event` handshake.
async function waitConnected(hub: OpenCodeHub): Promise<void> {
  let connected = false;
  const subscription = hub.onState((value) => {
    connected = value;
  });
  try {
    await until(() => connected);
  } finally {
    subscription.dispose();
  }
}

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
