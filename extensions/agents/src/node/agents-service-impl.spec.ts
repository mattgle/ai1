import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
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
  let symlinkFixture: { folder: string; link: string } | undefined;

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
    service.init(
      () => Promise.resolve(new OpenCodeClient({ baseUrl, password: server.password })),
      { retryMs: 20 },
      (name) => `/fake/bin/${name}`,
    );
    client = new RecordingClient();
    service.setClient(client);
  });

  afterEach(async () => {
    service.setClient(undefined);
    service.dispose();
    await server.stop();
    if (symlinkFixture) {
      fs.rmSync(symlinkFixture.link, { force: true });
      fs.rmSync(symlinkFixture.folder, { recursive: true, force: true });
      symlinkFixture = undefined;
    }
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

  it("gives the same groups for a workspace root with a trailing slash", async () => {
    const snapshot = await service.load(["file:///m/"]);
    assert.deepStrictEqual(
      snapshot.groups.map((group) => [group.name, group.sessions.map((s) => `${s.id}:${s.status}`)]),
      [
        ["beta", ["ses_b:done"]],
        ["alpha", ["ses_a:working"]],
      ],
    );
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
    const cardsAfterStart = client.changed.filter((s) => s.id === "ses_b").length;
    server.pushEvent("session.step.streamed", { sessionID: "ses_b" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(client.changed.filter((s) => s.id === "ses_b").length, cardsAfterStart);
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

  it("finds sessions under a workspace root that is a symbolic link", async () => {
    // A raw temp dir path can itself cross a symbolic link (macOS's `/tmp`
    // and `/var` are both symlinks), so resolve it once up front and use
    // that resolved path as the session's directory, matching what a real
    // OpenCode server would report for a session created there.
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-agents-root-")));
    const link = path.join(path.dirname(folder), `ai1-agents-link-${Date.now()}`);
    fs.symlinkSync(folder, link);
    symlinkFixture = { folder, link };
    server.sessions = [
      {
        id: "ses_link",
        title: "Linked",
        directory: folder,
        model: { id: "m", providerID: "p" },
        time: { created: 1, updated: 1 },
      },
    ];
    const snapshot = await service.load([pathToFileURL(link).toString()]);
    assert.deepStrictEqual(
      snapshot.groups.map((group) => group.sessions.map((s) => s.id)),
      [["ses_link"]],
    );
  });

  it("gives the interface command line for a session, with the resolved absolute path", async () => {
    assert.deepStrictEqual(await service.sessionCommand("ses_a", "/m/alpha"), {
      program: "/fake/bin/opencode",
      args: ["--session", "ses_a", "/m/alpha"],
    });
  });

  it("rejects sessionCommand with the install message when opencode is not on PATH", async () => {
    // `sessionCommand` never connects, so the connect factory here is a
    // stand-in that must not be called.
    service.init(
      () => Promise.reject(new Error("not used")),
      {},
      () => {
        throw new Error("OpenCode is not installed. Install it with: brew install opencode");
      },
    );
    await assert.rejects(service.sessionCommand("ses_a", "/m/alpha"), /OpenCode is not installed/);
  });

  it("gives the tmux command line, with the resolved absolute path, omitting -c with no directory", async () => {
    assert.deepStrictEqual(await service.tmuxCommand("ai1-1", "/m/alpha"), {
      program: "/fake/bin/tmux",
      args: ["new", "-A", "-s", "ai1-1", "-c", "/m/alpha"],
    });
    assert.deepStrictEqual(await service.tmuxCommand("ai1-1"), {
      program: "/fake/bin/tmux",
      args: ["new", "-A", "-s", "ai1-1"],
    });
  });

  it("rejects tmuxCommand with the install message when tmux is not on PATH", async () => {
    service.init(
      () => Promise.reject(new Error("not used")),
      {},
      () => {
        throw new Error("tmux is not installed. Install it with: brew install tmux");
      },
    );
    await assert.rejects(service.tmuxCommand("ai1-1", "/m/alpha"), /tmux is not installed/);
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
