import * as assert from "node:assert";
import { AgentsClient, SessionSummary } from "../common/agents-protocol";
import { AgentsServiceImpl } from "./agents-service-impl";
import { FakeOpenCodeServer } from "./fake-opencode-server";
import { OpenCodeClient } from "./opencode-client";

class RecordingClient implements AgentsClient {
  changed: SessionSummary[] = [];
  removed: string[] = [];
  connection: boolean[] = [];
  onSessionChanged(summary: SessionSummary): void {
    this.changed.push(summary);
  }
  onSessionRemoved(id: string): void {
    this.removed.push(id);
  }
  onConnectionChanged(connected: boolean): void {
    this.connection.push(connected);
  }
}

describe("AgentsServiceImpl", () => {
  let server: FakeOpenCodeServer;
  let service: AgentsServiceImpl;
  let client: RecordingClient;

  beforeEach(async () => {
    server = new FakeOpenCodeServer();
    const baseUrl = await server.start();
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
      {
        id: "ses_x",
        title: "X",
        directory: "/elsewhere",
        model: { id: "m", providerID: "p" },
        time: { created: 3, updated: 99 },
      },
    ];
    server.active.add("ses_a");
    server.messages.set("ses_b", ["hello", "world"]);
    service = new AgentsServiceImpl();
    service.init(() => Promise.resolve(new OpenCodeClient({ baseUrl, password: server.password })), {
      retryMs: 20,
    });
    client = new RecordingClient();
    service.setClient(client);
  });

  afterEach(async () => {
    service.setClient(undefined);
    service.dispose();
    await server.stop();
  });

  it("loads the groups inside the workspace with their status", async () => {
    const snapshot = await service.load(["file:///m"]);
    assert.deepStrictEqual(
      snapshot.groups.map((group) => [group.name, group.sessions.map((s) => `${s.id}:${s.status}`)]),
      [
        ["beta", ["ses_b:done"]],
        ["alpha", ["ses_a:working"]],
      ],
    );
    assert.strictEqual(snapshot.groups[0].sessions[0].messageCount, 2);
  });

  it("gives the last message on demand", async () => {
    await service.load(["file:///m"]);
    assert.strictEqual(await service.lastMessage("ses_b"), "world");
  });

  it("pushes one card when an event changes a session", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    await until(() => client.changed.some((s) => s.id === "ses_b" && s.status === "working"));
    server.pushEvent("session.execution.succeeded", { sessionID: "ses_b" });
    await until(() => client.changed.some((s) => s.id === "ses_b" && s.status === "done"));
  });

  it("marks a session blocked on a permission event and clears it on the reply", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.permission.requested", { sessionID: "ses_a" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "blocked"));
    server.pushEvent("session.permission.replied", { sessionID: "ses_a" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "working"));
  });

  it("creates a session in a directory and deletes it", async () => {
    await service.load(["file:///m"]);
    const created = await service.createSession("/m/alpha", "Probe");
    assert.strictEqual(created.directory, "/m/alpha");
    await service.deleteSession(created.id);
    assert.ok(client.removed.includes(created.id));
  });

  it("puts no password into any payload", async () => {
    const snapshot = await service.load(["file:///m"]);
    assert.ok(!JSON.stringify(snapshot).includes(server.password));
    assert.ok(!JSON.stringify(await service.sessionCommand("ses_a", "/m/alpha")).includes(server.password));
  });

  it("gives the interface command line for a session", async () => {
    assert.deepStrictEqual(await service.sessionCommand("ses_a", "/m/alpha"), {
      program: "opencode",
      args: ["--session", "ses_a", "/m/alpha"],
    });
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
