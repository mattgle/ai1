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
    assert.strictEqual(snapshot.truncated, false);
  });

  it("reports the snapshot as truncated when the global session cap cuts off real data", async () => {
    server.endlessPages = true;
    const snapshot = await service.load(["file:///m/alpha"]);
    assert.strictEqual(snapshot.truncated, true);
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

  it("removes the card and stops retrying when a session's last message gives 404, confirmed by a second call", async () => {
    await service.load(["file:///m"]);
    // Confirmed gone two ways: the message route 404s, and the session is
    // also absent from the single-session route (`GET /api/session/{id}`)
    // -- the same as the live service reports for a session truly deleted.
    server.goneSessionIds.add("ses_b");
    server.sessions = server.sessions.filter((s) => s.id !== "ses_b");
    const text = await service.lastMessage("ses_b");
    assert.strictEqual(text, undefined);
    assert.ok(client.removed.includes("ses_b"), "the card must go, the same path as session.deleted");
    assert.strictEqual(client.removed.filter((id) => id === "ses_b").length, 1);
    const messageRequestsBefore = server.requests.filter(
      (r) => r === "GET /api/session/ses_b/message",
    ).length;
    assert.ok(messageRequestsBefore > 0);
    // Not tracked any more, so a second call for the same id must not hit
    // the server again -- the request is not retried.
    const text2 = await service.lastMessage("ses_b");
    assert.strictEqual(text2, undefined);
    assert.strictEqual(
      server.requests.filter((r) => r === "GET /api/session/ses_b/message").length,
      messageRequestsBefore,
      "a second call for an already-removed session must not make a further request",
    );
  });

  it("does not remove the card when the message route 404s but the session still exists on a second call", async () => {
    // A 404 from one route alone is not proof enough: the message route
    // reports gone, but `GET /api/session/ses_b` (still in
    // `server.sessions`) says it is still there -- an unconfirmed 404,
    // treated as a normal error, not a removal.
    await service.load(["file:///m"]);
    server.goneSessionIds.add("ses_b");
    await assert.rejects(service.lastMessage("ses_b"), /404/);
    assert.ok(!client.removed.includes("ses_b"), "an unconfirmed 404 must not remove the card");
  });

  it("queues the removal from a confirmed 404 while a load is in progress, and applies it once that load ends", async () => {
    // First, an ordinary load: ses_b is tracked normally.
    await service.load(["file:///m"]);
    // The message route and the single-session route both say ses_b is
    // gone (confirmed), but `server.sessions` -- so the paginated list
    // route a load in progress reads -- still has it, the way an
    // in-flight load can see a slightly different, still-in-progress view
    // than this one, independent confirm check just saw.
    server.goneSessionIds.add("ses_b");
    server.singleSessionGoneIds.add("ses_b");
    server.holdSessionResponse = true;
    const second = service.load(["file:///m"]);
    await until(() => server.heldSessionRequests === 1);
    const removedBefore = client.removed.length;
    const text = await service.lastMessage("ses_b");
    assert.strictEqual(text, undefined);
    // The second load is still in flight (`loadDepth > 0`): the removal
    // must be queued, the same as a live event would be, not applied
    // directly here -- applying it now, while `doLoadFetch` is itself
    // about to rebuild `tracked` from a list that still has ses_b, would
    // let the rebuild silently resurrect it with no removal notice ever
    // correcting that.
    assert.strictEqual(
      client.removed.length,
      removedBefore,
      "the removal must wait for the load in progress to end",
    );
    server.releaseSessionRequest();
    await second;
    // The queued event replays against the load's own fresh rebuild, which
    // still has ses_b (`server.sessions` was never changed): it finds the
    // match and removes it correctly, once, after the rebuild.
    await until(() => client.removed.includes("ses_b"));
    assert.strictEqual(client.removed.filter((id) => id === "ses_b").length, 1);
  });

  it("stops the message-count phase after the first request timeout, instead of costing one timeout per batch", async () => {
    // 20 sessions at a concurrency of 4 (`MESSAGE_COUNT_CONCURRENCY`) is
    // five sequential batches if every one of them has to time out on its
    // own -- 5 x 200ms here, and 200 sessions at the real 15s default
    // would be over 12 minutes. Once the first request times out, the
    // phase must stop starting new ones: every session whose call has not
    // started yet gets 0 at once, with no request of its own, so the
    // whole phase costs about one timeout, not `sessions / 4`.
    const SESSION_COUNT = 20;
    // The value of `MESSAGE_COUNT_CONCURRENCY` in `agents-service-impl.ts`
    // (private to that module, so mirrored here as a literal).
    const CONCURRENCY = 4;
    server.sessions = Array.from({ length: SESSION_COUNT }, (_, i) => ({
      id: `ses_hang_${i}`,
      title: `${i}`,
      directory: "/m/alpha",
      model: { id: "m", providerID: "p" },
      time: { created: i, updated: i },
    }));
    server.hangMessageRequests = true;
    const timeoutMs = 200;
    const shortTimeoutHub = new OpenCodeHub();
    shortTimeoutHub.init(
      () =>
        Promise.resolve(
          new OpenCodeClient(
            { baseUrl: server.baseUrl, password: server.password },
            { requestTimeoutMs: timeoutMs },
          ),
        ),
      { retryMs: 20 },
    );
    const timeoutService = new AgentsServiceImpl();
    timeoutService.init(shortTimeoutHub, (name) => `/fake/bin/${name}`);
    const timeoutClient = new RecordingClient();
    timeoutService.setClient(timeoutClient);
    try {
      const started = Date.now();
      const snapshot = await timeoutService.load(["file:///m"]);
      const elapsed = Date.now() - started;
      const alpha = snapshot.groups.find((g) => g.name === "alpha");
      assert.strictEqual(alpha?.sessions.length, SESSION_COUNT);
      // Every session ends up at 0: the ones that were actually attempted
      // time out (`.catch`-equivalent fallback), and the rest never get a
      // request at all -- so this alone would not catch the old bug. The
      // request count and the elapsed time below are the real proof.
      assert.ok(alpha!.sessions.every((s) => s.messageCount === 0));
      const messageRequestCount = server.requests.filter((r) => /\/message(\?|$)/.test(r)).length;
      assert.ok(
        messageRequestCount <= CONCURRENCY,
        `expected at most ${CONCURRENCY} message requests (the concurrency limit), saw ${messageRequestCount}`,
      );
      assert.ok(
        elapsed < (SESSION_COUNT / CONCURRENCY) * timeoutMs,
        `expected well under a full ${SESSION_COUNT / CONCURRENCY} x ${timeoutMs}ms run, took ${elapsed}ms`,
      );
      assert.ok(elapsed < timeoutMs * 2, `expected about one timeout, took ${elapsed}ms`);
    } finally {
      shortTimeoutHub.dispose();
      timeoutService.dispose();
    }
  });

  it("does not stop the message-count phase for an ordinary per-session error, only for a request timeout", async () => {
    // A 404 for one session (`goneSessionIds`) must count as 0 for that
    // one session alone, the same as before this fix round; every other
    // session must still get its own real message count, not be skipped.
    server.sessions = Array.from({ length: 6 }, (_, i) => ({
      id: `ses_mix_${i}`,
      title: `${i}`,
      directory: "/m/alpha",
      model: { id: "m", providerID: "p" },
      time: { created: i, updated: i },
    }));
    for (let i = 0; i < 6; i += 1) {
      server.messages.set(`ses_mix_${i}`, ["a", "b", "c"]);
    }
    server.goneSessionIds.add("ses_mix_2");
    const snapshot = await service.load(["file:///m"]);
    const alpha = snapshot.groups.find((g) => g.name === "alpha");
    assert.strictEqual(alpha?.sessions.length, 6);
    const byId = new Map(alpha!.sessions.map((s) => [s.id, s.messageCount]));
    assert.strictEqual(byId.get("ses_mix_2"), 0, "the 404'd session counts as 0");
    for (let i = 0; i < 6; i += 1) {
      if (i === 2) {
        continue;
      }
      assert.strictEqual(
        byId.get(`ses_mix_${i}`),
        3,
        `ses_mix_${i} must still get its own real count, not be skipped after the 404`,
      );
    }
  });

  it("limits the message-count calls of a load to 4 at a time", async () => {
    server.sessions = Array.from({ length: 10 }, (_, i) => ({
      id: `ses_load_${i}`,
      title: `${i}`,
      directory: "/m/alpha",
      model: { id: "m", providerID: "p" },
      time: { created: i, updated: i },
    }));
    server.messageRequestDelayMs = 30;
    await service.load(["file:///m"]);
    assert.ok(
      server.maxConcurrentMessageRequests <= 4,
      `expected at most 4 concurrent message-count requests, saw ${server.maxConcurrentMessageRequests}`,
    );
    assert.ok(
      server.maxConcurrentMessageRequests > 1,
      "the test itself must exercise real concurrency, or it would prove nothing",
    );
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
