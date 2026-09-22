import * as assert from "node:assert";
import { FakeOpenCodeServer } from "./fake-opencode-server";
import { OpenCodeClient, runCommand } from "./opencode-client";

describe("OpenCodeClient", () => {
  let server: FakeOpenCodeServer;
  let client: OpenCodeClient;

  beforeEach(async () => {
    server = new FakeOpenCodeServer();
    const baseUrl = await server.start();
    client = new OpenCodeClient({ baseUrl, password: server.password });
    server.sessions = [
      {
        id: "ses_a",
        title: "A",
        directory: "/m/alpha",
        model: { id: "m1", providerID: "p" },
        time: { created: 1, updated: 5 },
      },
      {
        id: "ses_b",
        title: "B",
        directory: "/m/beta",
        model: { id: "m2", providerID: "p" },
        time: { created: 2, updated: 9 },
        outcome: "succeeded",
      },
    ];
  });

  afterEach(async () => {
    await server.stop();
  });

  it("lists all sessions across pages", async () => {
    server.sessions = Array.from({ length: 250 }, (_, i) => ({
      id: `ses_${i}`,
      title: `${i}`,
      directory: "/m/alpha",
      model: { id: "m", providerID: "p" },
      time: { created: i, updated: i },
    }));
    const sessions = await client.listSessions();
    assert.strictEqual(sessions.length, 250);
    assert.strictEqual(server.requests.filter((r) => r === "GET /api/session").length, 3);
  });

  it("reads the active ids and the pending permission ids", async () => {
    server.active.add("ses_a");
    server.pending.add("ses_b");
    assert.deepStrictEqual([...(await client.activeIds())], ["ses_a"]);
    assert.deepStrictEqual([...(await client.pendingPermissionSessionIds())], ["ses_b"]);
  });

  it("reads the last message text and the message count", async () => {
    server.messages.set("ses_a", ["first", "second", "third"]);
    assert.strictEqual(await client.lastMessageText("ses_a"), "third");
    assert.strictEqual(await client.messageCount("ses_a"), 3);
    assert.strictEqual(await client.lastMessageText("ses_b"), undefined);
  });

  it("creates and deletes a session", async () => {
    const created = await client.createSession("Probe", "/m/alpha");
    assert.strictEqual(created.title, "Probe");
    await client.deleteSession(created.id);
    assert.ok(!server.sessions.some((session) => session.id === created.id));
  });

  it("rejects with a clear message on 401", async () => {
    const wrong = new OpenCodeClient({ baseUrl: server.baseUrl, password: "no" });
    await assert.rejects(wrong.listSessions(), /401|authenticate/);
  });

  it("delivers events and reconnects after a cut", async () => {
    const seen: string[] = [];
    const states: boolean[] = [];
    const subscription = client.subscribe(
      (type) => seen.push(type),
      (connected) => states.push(connected),
      { retryMs: 20 },
    );
    await until(() => states.includes(true));
    server.pushEvent("session.execution.started", { sessionID: "ses_a" });
    await until(() => seen.includes("session.execution.started"));
    server.dropStreams();
    await until(() => states.includes(false));
    await until(() => states.filter((s) => s).length === 2);
    server.pushEvent("session.execution.succeeded", { sessionID: "ses_a" });
    await until(() => seen.includes("session.execution.succeeded"));
    subscription.dispose();
  });

  it("rejects when the opencode binary is missing", async () => {
    await assert.rejects(runCommand("ai1-no-such-program", []), /is not installed/);
  });
});

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
