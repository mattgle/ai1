import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { AgentsClient, SessionSummary } from "../common/agents-protocol";
import { AgentsServiceImpl } from "./agents-service-impl";
import { FakeOpenCodeServer } from "./fake-opencode-server";
import { OpenCodeClient } from "./opencode-client";
import { OpenCodeHub } from "./opencode-hub";

class RecordingClient implements AgentsClient {
  changed: SessionSummary[] = [];
  removed: string[] = [];
  connection: boolean[] = [];
  reloadRequests = 0;
  onSessionChanged(summary: SessionSummary): void {
    this.changed.push(summary);
  }
  onSessionRemoved(id: string): void {
    this.removed.push(id);
  }
  onConnectionChanged(connected: boolean): void {
    this.connection.push(connected);
  }
  onReloadRequested(): void {
    this.reloadRequests += 1;
  }
}

describe("AgentsServiceImpl", () => {
  let server: FakeOpenCodeServer;
  let hub: OpenCodeHub;
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
    hub = new OpenCodeHub();
    hub.init(() => Promise.resolve(new OpenCodeClient({ baseUrl, password: server.password })), {
      retryMs: 20,
    });
    service = new AgentsServiceImpl();
    service.init(hub, (name) => `/fake/bin/${name}`);
    client = new RecordingClient();
    service.setClient(client);
  });

  afterEach(async () => {
    service.dispose();
    hub.dispose();
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

  it("queues an event that arrives while a load is in flight, and applies it after the rebuild", async () => {
    // The session list itself is delayed, so the event below reaches
    // `onEvent` well before `tracked` is rebuilt from the delayed answer.
    // This is the very first load, so applied straight away (the pre-fix
    // behavior) it would find no tracked entry at all yet and be dropped
    // for good; the fix queues it and replays it once `tracked` holds
    // ses_b again, which pushes the usual card to the client.
    server.delayMs = 200;
    const loadPromise = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    await loadPromise;
    await until(() => client.changed.some((s) => s.id === "ses_b" && s.status === "working"));
  });

  it("does not double count messageCount for a session.step.ended event replayed after a load", async () => {
    // The fetched `messageCount` (from the paged message list, below)
    // already reflects this step: replaying the queued event on top of it
    // must not add 1 again. Real count 4; the pre-fix code gives 5.
    server.delayMs = 200;
    server.messages.set("ses_b", ["a", "b", "c", "d"]);
    const loadPromise = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.step.ended", { sessionID: "ses_b" });
    await loadPromise;
    await until(() => client.changed.some((s) => s.id === "ses_b"));
    const card = client.changed.find((s) => s.id === "ses_b");
    assert.strictEqual(card?.messageCount, 4);
  });

  it("keeps a queued event queued until every overlapping load() call on this instance has ended", async () => {
    server.holdSessionResponse = true;
    const first = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    await until(() => server.heldSessionRequests === 1);
    const second = service.load(["file:///m"]);
    await until(() => server.heldSessionRequests === 2);
    server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    await until(() => queuedEventTypes(service).includes("session.execution.started"));
    server.releaseSessionRequest();
    await first;
    // The bug this guards against: the pre-fix code has one flag for
    // "a load is running", so the first of two overlapping loads ending
    // clears it and drains the queue early, even though `second` is still
    // in flight and about to rebuild `tracked` again, discarding whatever
    // that early drain just applied.
    assert.ok(
      queuedEventTypes(service).includes("session.execution.started"),
      "the queued event must stay queued while a second load on this instance is still in flight",
    );
    server.releaseSessionRequest();
    await second;
    assert.ok(!queuedEventTypes(service).includes("session.execution.started"));
    await until(() => client.changed.some((s) => s.id === "ses_b" && s.status === "working"));
  });

  it("keeps a flooded event queue bounded", async () => {
    server.holdSessionResponse = true;
    const first = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    await until(() => server.heldSessionRequests === 1);
    for (let i = 0; i < 2000; i += 1) {
      server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    }
    await until(() => (service as unknown as { queueOverflowed: boolean }).queueOverflowed === true);
    const queueLength = (service as unknown as { queuedEvents: unknown[] }).queuedEvents.length;
    assert.ok(queueLength <= 1000, `expected the queue to stay at or under the limit, got ${queueLength}`);
    server.releaseSessionRequest();
    await first;
  });

  it("notifies the client to reload after an event-queue overflow, instead of reloading itself", async () => {
    // The reviewer's own scenario: a real, actionable event for ses_b,
    // surrounded by 1500 unrelated events for another session, all while
    // a load is held open.
    server.holdSessionResponse = true;
    const first = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    await until(() => server.heldSessionRequests === 1);
    server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    for (let i = 0; i < 1500; i += 1) {
      server.pushEvent("session.execution.started", { sessionID: "ses_a" });
    }
    await until(() => (service as unknown as { queueOverflowed: boolean }).queueOverflowed === true);
    assert.strictEqual(client.reloadRequests, 0, "not yet -- the held load has not ended");
    server.releaseSessionRequest();
    await first;
    await until(() => client.reloadRequests === 1);
    // No self-reload: the fake server sees no second `GET /api/session`
    // on the service's own initiative.
    assert.strictEqual(server.requests.filter((r) => r === "GET /api/session").length, 1);
    // ses_b's own event was queued (it arrived first, so it is part of
    // the batch the overflow at event 1000 drops), then lost for good
    // when the queue was dropped -- the reload notification above is the
    // only way this connection's window can still learn ses_b is
    // working. `AgentsModel.onReloadRequested` reacts to it with its own
    // `load()`; this test plays that part directly, the same way the
    // live OpenCode service's own state (not just the one lost event)
    // would already show ses_b active by the time a fresh load runs.
    server.active.add("ses_b");
    server.holdSessionResponse = false;
    const snapshot = await service.load(["file:///m"]);
    const beta = snapshot.groups.find((group) => group.name === "beta");
    assert.strictEqual(beta?.sessions[0].status, "working");
  });

  it("does not queue an event onEvent would not act on anyway", async () => {
    server.holdSessionResponse = true;
    const first = service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    await until(() => server.heldSessionRequests === 1);
    // Wrong prefix; right prefix but no `sessionID`; then the one real,
    // actionable event. The fake server's own "server.connected" welcome
    // line on connect (above) is the same case as the first of these.
    server.pushEvent("server.custom", {});
    server.pushEvent("session.step.ended", {});
    server.pushEvent("session.execution.started", { sessionID: "ses_b" });
    await until(() => queuedEventTypes(service).includes("session.execution.started"));
    assert.deepStrictEqual(queuedEventTypes(service), ["session.execution.started"]);
    server.releaseSessionRequest();
    await first;
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
    server.pushEvent("permission.asked", { sessionID: "ses_a", id: "req_1" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "blocked"));
    server.pushEvent("permission.replied", { sessionID: "ses_a", requestID: "req_1" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "working"));
  });

  it("stays blocked while a second permission request is still open", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("permission.asked", { sessionID: "ses_a", id: "req_1" });
    server.pushEvent("permission.asked", { sessionID: "ses_a", id: "req_2" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "blocked"));
    server.pushEvent("permission.replied", { sessionID: "ses_a", requestID: "req_1" });
    // The reply to req_1 alone must not clear the blocked status: req_2 is
    // still open. Give the (wrong, pre-fix) behavior a moment to show up
    // before asserting it stays blocked.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(!client.changed.some((s) => s.id === "ses_a" && s.status !== "blocked"));
    server.pushEvent("permission.replied", { sessionID: "ses_a", requestID: "req_2" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "working"));
  });

  it("clears the working status once a succeeded event arrives, even for a session the load found in server.active", async () => {
    // ses_a is in server.active at load time, so its facts start
    // {active: true, running: false}; a bare `running: false` after the
    // succeeded event must not leave it "working" if `active` itself is
    // not cleared too.
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.execution.succeeded", { sessionID: "ses_a" });
    await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "done"));
    assert.ok(!client.changed.some((s) => s.id === "ses_a" && s.status === "working"));
  });

  it("sends no event to a client for a session outside the workspace roots", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    // ses_x is /elsewhere, a real, already-loaded session (in
    // server.sessions from the start), not inside any workspace root -- an
    // ordinary status event for it must reach no client, the same as a
    // session this connection never heard of at all.
    server.pushEvent("session.execution.started", { sessionID: "ses_x" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(!client.changed.some((s) => s.id === "ses_x"));
  });

  it("adds a session created elsewhere inside the workspace, and ignores one outside it", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.created", {
      sessionID: "ses_new",
      location: { directory: "/m/alpha" },
      title: "New from elsewhere",
    });
    await until(() => client.changed.some((s) => s.id === "ses_new"));
    const added = client.changed.find((s) => s.id === "ses_new")!;
    assert.strictEqual(added.directory, "/m/alpha");
    assert.strictEqual(added.title, "New from elsewhere");
    const changedBefore = client.changed.length;
    server.pushEvent("session.created", {
      sessionID: "ses_outside",
      location: { directory: "/elsewhere/new" },
      title: "Outside the workspace",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(client.changed.length, changedBefore);
  });

  it("removes a session deleted elsewhere, idempotently with AI1's own deleteSession", async () => {
    await service.load(["file:///m"]);
    await until(() => client.connection.includes(true));
    server.pushEvent("session.deleted", { sessionID: "ses_a" });
    await until(() => client.removed.includes("ses_a"));
    const removedCount = client.removed.filter((id) => id === "ses_a").length;
    assert.strictEqual(removedCount, 1);
    // A second event for the same (already removed) id is a no-op.
    server.pushEvent("session.deleted", { sessionID: "ses_a" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(client.removed.filter((id) => id === "ses_a").length, 1);
  });

  it("keeps two connections' sessions and roots apart, and disposing one does not stop the other", async () => {
    // The standard Theia per-connection pattern: one `AgentsServiceImpl`
    // instance per window, sharing one `OpenCodeHub`. `service` (this
    // describe block's own instance, opened on /m/alpha) plays the first
    // window; `second` (opened on /m/beta) plays a second window.
    const secondClient = new RecordingClient();
    const second = new AgentsServiceImpl();
    second.init(hub, (name) => `/fake/bin/${name}`);
    second.setClient(secondClient);
    try {
      const snapshotA = await service.load(["file:///m/alpha"]);
      const snapshotB = await second.load(["file:///m/beta"]);
      // Each connection's own load shows only its own root's sessions --
      // never the other connection's.
      assert.deepStrictEqual(
        snapshotA.groups.map((g) => g.sessions.map((s) => s.id)),
        [["ses_a"]],
      );
      assert.deepStrictEqual(
        snapshotB.groups.map((g) => g.sessions.map((s) => s.id)),
        [["ses_b"]],
      );
      await until(() => client.connection.includes(true) && secondClient.connection.includes(true));
      // An event for ses_a (alpha, the first connection's own root) must
      // reach only the first connection's client. ses_a is already
      // "working" at load time (server.active has it), so a permission
      // event, not another execution-started event, is the one that
      // actually changes its status here.
      server.pushEvent("permission.asked", { sessionID: "ses_a", id: "req_1" });
      await until(() => client.changed.some((s) => s.id === "ses_a" && s.status === "blocked"));
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(!secondClient.changed.some((s) => s.id === "ses_a"));
      // Disposing the first connection (closing that window) must not stop
      // the second connection's own events -- the hub, and its one
      // subscription, are shared and outlive either one window.
      service.dispose();
      const secondChangedBefore = secondClient.changed.length;
      server.pushEvent("session.execution.started", { sessionID: "ses_b" });
      await until(() => secondClient.changed.length > secondChangedBefore);
      assert.ok(secondClient.changed.some((s) => s.id === "ses_b" && s.status === "working"));
    } finally {
      second.dispose();
    }
  });

  it("loads a session that already has a pending permission as blocked", async () => {
    // ses_a is /m/alpha, ses_b is /m/beta: a permission already pending for
    // ses_a at load time (the "already blocked at startup" case) must not
    // leak into ses_b's directory-scoped call, and must not need the header
    // to be the workspace root -- only ses_a's own directory matches it.
    server.pending.add("ses_a");
    const snapshot = await service.load(["file:///m"]);
    assert.deepStrictEqual(
      snapshot.groups.map((group) => [group.name, group.sessions.map((s) => `${s.id}:${s.status}`)]),
      [
        ["beta", ["ses_b:done"]],
        ["alpha", ["ses_a:blocked"]],
      ],
    );
  });

  it("still loads every session when one directory's permission check gives an HTTP error", async () => {
    // The live service answers 500 for a directory it does not have on disk
    // any more (a deleted repository, still in a session's stored
    // directory). One bad directory must not fail the whole load.
    server.pending.add("ses_b");
    server.brokenPermissionDirectories.add("/m/alpha");
    const snapshot = await service.load(["file:///m"]);
    assert.deepStrictEqual(
      snapshot.groups.map((group) => [group.name, group.sessions.map((s) => `${s.id}:${s.status}`)]),
      [
        ["beta", ["ses_b:blocked"]],
        ["alpha", ["ses_a:working"]],
      ],
    );
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
    // `sessionCommand` never connects, so the hub here is a stand-in that
    // must not be called.
    const unusedHub = new OpenCodeHub();
    unusedHub.init(() => Promise.reject(new Error("not used")));
    service.init(unusedHub, () => {
      throw new Error("OpenCode is not installed. Install it with: brew install opencode");
    });
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
    const unusedHub = new OpenCodeHub();
    unusedHub.init(() => Promise.reject(new Error("not used")));
    service.init(unusedHub, () => {
      throw new Error("tmux is not installed. Install it with: brew install tmux");
    });
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

// A white-box peek at `AgentsServiceImpl`'s own queued-event types (not
// part of its public interface): the fake server's own welcome line on
// every SSE connect (`"server.connected"`, harmless -- it carries no
// `sessionID`) queues too, while a load is in progress, alongside
// whatever a test explicitly pushes, so a test that cares about one
// particular type checks for that type instead of an exact queue length.
function queuedEventTypes(service: AgentsServiceImpl): string[] {
  return (service as unknown as { queuedEvents: { type: string }[] }).queuedEvents.map((event) => event.type);
}
