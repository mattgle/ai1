import * as assert from "node:assert";
import * as os from "node:os";
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

  it("lists all sessions across pages, below the session cap", async () => {
    server.sessions = Array.from({ length: 150 }, (_, i) => ({
      id: `ses_${i}`,
      title: `${i}`,
      directory: "/m/alpha",
      model: { id: "m", providerID: "p" },
      time: { created: i, updated: i },
    }));
    const { sessions, truncated } = await client.listSessions();
    assert.strictEqual(sessions.length, 150);
    assert.strictEqual(server.requests.filter((r) => r === "GET /api/session").length, 2);
    assert.strictEqual(truncated, false);
  });

  it("reads the active ids and the pending permission request ids, grouped by session and scoped by directory", async () => {
    server.active.add("ses_a");
    server.pending.add("ses_b");
    assert.deepStrictEqual([...(await client.activeIds())], ["ses_a"]);
    const byDirectory = await client.pendingPermissionRequestIds("/m/beta");
    assert.deepStrictEqual([...byDirectory.keys()], ["ses_b"]);
    assert.deepStrictEqual([...byDirectory.get("ses_b")!], ["per_ses_b"]);
    // A directory that is not the session's own -- for example its parent --
    // gives no match, not a prefix match.
    assert.deepStrictEqual([...(await client.pendingPermissionRequestIds("/m")).keys()], []);
    assert.deepStrictEqual([...(await client.pendingPermissionRequestIds("/m/alpha")).keys()], []);
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

  it("rejects with a clear message on 401 that names the credentials file, with ~ for the home folder", async () => {
    const wrong = new OpenCodeClient({ baseUrl: server.baseUrl, password: "no" });
    await assert.rejects(wrong.listSessions(), /401/);
    await assert.rejects(wrong.listSessions(), /~\/\.config\/opencode\/service\.json/);
    // Never the real, absolute path -- that would put the owner's user name
    // in a message a widget can show on screen.
    await assert.rejects(wrong.listSessions(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(os.homedir()));
      return true;
    });
  });

  it("rejects a request the service never answers, within its own configured timeout", async () => {
    server.holdSessionResponse = true;
    const impatient = new OpenCodeClient(
      { baseUrl: server.baseUrl, password: server.password },
      {
        requestTimeoutMs: 50,
      },
    );
    const started = Date.now();
    await assert.rejects(impatient.listSessions(), /did not answer/);
    assert.ok(Date.now() - started < 1000, "must reject well within the test's own timeout, not hang");
  });

  it("does not time out a request that answers before the configured timeout", async () => {
    const patient = new OpenCodeClient(
      { baseUrl: server.baseUrl, password: server.password },
      {
        requestTimeoutMs: 200,
      },
    );
    server.delayMs = 20;
    const { sessions } = await patient.listSessions();
    assert.strictEqual(sessions.length, 2);
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

  it("ignores a response that arrives after dispose", async () => {
    const seen: string[] = [];
    const states: boolean[] = [];
    const subscription = client.subscribe(
      (type) => seen.push(type),
      (connected) => states.push(connected),
      { retryMs: 20 },
    );
    await until(() => states.includes(true));
    subscription.dispose();
    const seenBefore = seen.length;
    const statesBefore = states.length;
    server.dropStreams();
    server.pushEvent("session.execution.started", { sessionID: "ses_a" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(seen.length, seenBefore);
    assert.strictEqual(states.length, statesBefore);
  });

  it("rejects with a clear message when the body is not JSON", async () => {
    server.brokenSessionBody = true;
    await assert.rejects(client.listSessions(), /not JSON/);
  });

  it("stops listing sessions when the server repeats the cursor", async () => {
    server.repeatCursor = true;
    const { sessions } = await client.listSessions();
    assert.ok(sessions.length > 0);
    assert.ok(server.requests.filter((r) => r === "GET /api/session").length <= 50);
  });

  it("stops the session list at 200 sessions, the spec value, warns once, and reports truncated", async () => {
    // The fake server's endless pages never stop on their own (see
    // `endlessPages` in `fake-opencode-server.ts`), so a list that actually
    // ends at 200 proves the client stops itself there, rather than merely
    // running out of data to page through.
    server.endlessPages = true;
    const calls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const { sessions, truncated } = await client.listSessions();
      assert.strictEqual(sessions.length, 200);
      // 100 sessions per page: the cap is reached exactly on the second
      // page, so a third page is never requested.
      assert.strictEqual(server.requests.filter((r) => r === "GET /api/session").length, 2);
      assert.strictEqual(calls.length, 1);
      assert.ok(String(calls[0][0]).includes("200 sessions"));
      assert.strictEqual(truncated, true);
    } finally {
      console.warn = originalWarn;
    }
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
