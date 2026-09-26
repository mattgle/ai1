import * as assert from "node:assert";
import {
  COMMAND_TIMEOUT_MS,
  DEVTOOLS_OPEN_ERROR,
  PAGE_NOT_ANSWERING_ERROR,
  RELEASE_TIMEOUT_MS,
  ViewportEmulation,
  ViewportEmulations,
} from "./viewport-emulation";

type Step = { kind: "attach"; version: string } | { kind: "detach" } | { kind: "command"; method: string };

class FakeDebugger {
  attached = false;
  throwOnAttach = false;
  steps: Step[] = [];
  params: Record<string, unknown> = {};
  // When set, the next command waits until the test calls `releaseAll`.
  holdNext = false;
  // The commands that never get an answer, as on a hung page. The fake
  // `detach()` does not reject them.
  hang = new Set<string>();
  private waiting: (() => void)[] = [];
  private detachListeners: (() => void)[] = [];

  isAttached(): boolean {
    return this.attached;
  }
  attach(version: string): void {
    if (this.throwOnAttach) {
      throw new Error("Another debugger is already attached to this target.");
    }
    this.attached = true;
    this.steps.push({ kind: "attach", version });
  }
  // Electron sends "detach" before `detach()` returns.
  detach(): void {
    this.attached = false;
    this.steps.push({ kind: "detach" });
    for (const listener of this.detachListeners) {
      listener();
    }
  }
  async sendCommand(method: string, params?: object): Promise<unknown> {
    this.steps.push({ kind: "command", method });
    if (!this.attached) {
      throw new Error("The debugger is not attached.");
    }
    this.params[method] = params;
    if (this.hang.has(method)) {
      return new Promise(() => undefined);
    }
    if (this.holdNext) {
      this.holdNext = false;
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return {};
  }
  on(_event: "detach", listener: () => void): void {
    this.detachListeners.push(listener);
  }
  releaseAll(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) {
      resolve();
    }
  }
  names(): string[] {
    return this.steps.map((step) => (step.kind === "command" ? step.method : step.kind));
  }
}

const PHONE = { width: 393, height: 852, deviceScaleFactor: 3, mobile: true, userAgent: "Phone UA" };
const CUSTOM = { width: 800, height: 600, deviceScaleFactor: 0, mobile: false };

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("ViewportEmulation", () => {
  let debug: FakeDebugger;
  let emulation: ViewportEmulation;

  beforeEach(() => {
    debug = new FakeDebugger();
    emulation = new ViewportEmulation(debug, () => "Default UA");
  });

  it("attaches the debugger and sends the three commands in order", async () => {
    await emulation.apply(PHONE);
    assert.deepStrictEqual(debug.steps[0], { kind: "attach", version: "1.3" });
    assert.deepStrictEqual(debug.names(), [
      "attach",
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setUserAgentOverride",
    ]);
    assert.deepStrictEqual(debug.params["Emulation.setDeviceMetricsOverride"], {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
    });
    assert.deepStrictEqual(debug.params["Emulation.setTouchEmulationEnabled"], {
      enabled: true,
      maxTouchPoints: 5,
    });
    assert.deepStrictEqual(debug.params["Emulation.setUserAgentOverride"], { userAgent: "Phone UA" });
    assert.strictEqual(emulation.userAgentOverride, "Phone UA");
  });

  it("sends the default user agent and no touch for a size with no user agent", async () => {
    await emulation.apply(PHONE);
    await emulation.apply(CUSTOM);
    assert.strictEqual(debug.names().filter((name) => name === "attach").length, 1);
    assert.deepStrictEqual(debug.params["Emulation.setTouchEmulationEnabled"], {
      enabled: false,
      maxTouchPoints: 1,
    });
    assert.deepStrictEqual(debug.params["Emulation.setUserAgentOverride"], { userAgent: "Default UA" });
    assert.strictEqual(emulation.userAgentOverride, undefined);
  });

  it("clears the overrides and detaches for undefined", async () => {
    await emulation.apply(PHONE);
    debug.steps = [];
    await emulation.apply(undefined);
    assert.deepStrictEqual(debug.names(), [
      "Emulation.clearDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setUserAgentOverride",
      "detach",
    ]);
    assert.deepStrictEqual(debug.params["Emulation.setTouchEmulationEnabled"], { enabled: false });
    assert.deepStrictEqual(debug.params["Emulation.setUserAgentOverride"], { userAgent: "Default UA" });
    assert.strictEqual(debug.attached, false);
    assert.strictEqual(emulation.userAgentOverride, undefined);
  });

  it("does nothing for undefined when it did not attach the debugger", async () => {
    await emulation.apply(undefined);
    await emulation.release();
    assert.deepStrictEqual(debug.steps, []);
  });

  it("gives the DevTools error when the debugger does not attach", async () => {
    debug.throwOnAttach = true;
    await assert.rejects(emulation.apply(PHONE), { message: DEVTOOLS_OPEN_ERROR });
    assert.strictEqual(DEVTOOLS_OPEN_ERROR, "Close DevTools to use viewport sizes.");
    assert.deepStrictEqual(debug.steps, []);
    debug.throwOnAttach = false;
    await emulation.apply(PHONE);
    assert.strictEqual(debug.attached, true);
  });

  it("release clears the overrides and detaches the debugger that it attached", async () => {
    await emulation.apply(PHONE);
    debug.steps = [];
    await emulation.release();
    assert.deepStrictEqual(debug.names(), [
      "Emulation.clearDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setUserAgentOverride",
      "detach",
    ]);
    assert.strictEqual(debug.attached, false);
  });

  it("release during a pending apply leaves the debugger detached and sends no command after the detach", async () => {
    debug.holdNext = true;
    const first = emulation.apply(PHONE);
    await flush();
    // The first apply waits on its first command. The second apply has not
    // started yet.
    const second = emulation.apply(CUSTOM);
    const released = emulation.release();
    await flush();
    debug.releaseAll();
    await Promise.all([first, second, released]);
    await flush();
    assert.strictEqual(debug.attached, false);
    const detachAt = debug.names().lastIndexOf("detach");
    assert.strictEqual(detachAt, debug.steps.length - 1);
    assert.strictEqual(debug.names().filter((name) => name === "attach").length, 1);
    assert.deepStrictEqual(
      (debug.params["Emulation.setDeviceMetricsOverride"] as { width: number }).width,
      393,
      "the second apply must not run",
    );
  });

  it("works again after a release", async () => {
    await emulation.apply(PHONE);
    await emulation.release();
    debug.steps = [];
    await emulation.apply(CUSTOM);
    assert.deepStrictEqual(debug.names()[0], "attach");
    assert.strictEqual(debug.attached, true);
  });

  it("does not send commands through a debugger that another client attached after it", async () => {
    await emulation.apply(PHONE);
    // The agent proxy detaches the debugger, then attaches its own session.
    debug.detach();
    debug.attach("1.3");
    debug.steps = [];
    await emulation.release();
    assert.deepStrictEqual(debug.steps, []);
    assert.strictEqual(debug.attached, true);
  });
});

describe("ViewportEmulation on a page that does not answer", () => {
  const LIMITS = { releaseTimeoutMs: 20, commandTimeoutMs: 40 };
  let debug: FakeDebugger;
  let emulation: ViewportEmulation;

  beforeEach(() => {
    debug = new FakeDebugger();
    emulation = new ViewportEmulation(debug, () => "Default UA", LIMITS);
  });

  it("uses a release limit of 2 seconds and a command limit by default", () => {
    assert.strictEqual(RELEASE_TIMEOUT_MS, 2000);
    assert.ok(COMMAND_TIMEOUT_MS >= RELEASE_TIMEOUT_MS);
  });

  it("release detaches after its limit while an apply waits for a command that never answers", async () => {
    debug.hang.add("Emulation.setDeviceMetricsOverride");
    const pending = emulation.apply(PHONE);
    const outcome = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    await flush();
    const started = Date.now();
    await emulation.release();
    assert.ok(Date.now() - started < LIMITS.commandTimeoutMs, "release must not wait for the command limit");
    assert.strictEqual(debug.attached, false);
    assert.strictEqual(debug.names().at(-1), "detach");
    assert.notStrictEqual(await outcome, "resolved");
  });

  it("release detaches after its limit when a clear command never answers", async () => {
    await emulation.apply(PHONE);
    debug.hang.add("Emulation.clearDeviceMetricsOverride");
    await emulation.release();
    assert.strictEqual(debug.attached, false);
    assert.strictEqual(debug.names().at(-1), "detach");
  });

  it("runs a later apply and release after a forced detach", async () => {
    debug.hang.add("Emulation.setDeviceMetricsOverride");
    emulation.apply(PHONE).catch(() => undefined);
    await flush();
    await emulation.release();
    debug.hang.clear();
    debug.steps = [];
    await emulation.apply(CUSTOM);
    assert.deepStrictEqual(debug.names(), [
      "attach",
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setUserAgentOverride",
    ]);
    await emulation.release();
    assert.strictEqual(debug.attached, false);
  });

  it("does not detach after the limit when it does not own the session", async () => {
    await emulation.apply(PHONE);
    debug.hang.add("Emulation.clearDeviceMetricsOverride");
    const released = emulation.release();
    await flush();
    // The agent proxy detaches the debugger and attaches its own session.
    debug.detach();
    debug.attach("1.3");
    debug.steps = [];
    await released;
    assert.deepStrictEqual(debug.steps, []);
    assert.strictEqual(debug.attached, true);
  });

  it("gives an error for an apply whose command does not answer, and the queue goes on", async () => {
    debug.hang.add("Emulation.setTouchEmulationEnabled");
    await assert.rejects(emulation.apply(PHONE), { message: PAGE_NOT_ANSWERING_ERROR });
    debug.hang.clear();
    debug.steps = [];
    await emulation.apply(CUSTOM);
    assert.deepStrictEqual(debug.names(), [
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setUserAgentOverride",
    ]);
  });
});

describe("ViewportEmulations", () => {
  it("makes one emulation for each guest, releases it, and forgets a removed guest", async () => {
    const debug = new FakeDebugger();
    const emulations = new ViewportEmulations();
    let created = 0;
    const make = () => {
      created++;
      return new ViewportEmulation(debug, () => "Default UA");
    };
    const first = emulations.getOrCreate(7, make);
    assert.strictEqual(emulations.getOrCreate(7, make), first);
    assert.strictEqual(created, 1);
    await first.apply(PHONE);
    await emulations.release(7);
    assert.strictEqual(debug.attached, false);
    await emulations.release(8);
    emulations.remove(7);
    assert.notStrictEqual(emulations.getOrCreate(7, make), first);
    assert.strictEqual(created, 2);
  });
});
