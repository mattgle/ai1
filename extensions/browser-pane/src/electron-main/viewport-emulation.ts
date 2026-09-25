import { injectable } from "@theia/core/shared/inversify";
import { ViewportSettings } from "../common/viewport";
import { SerialQueue } from "./serial-queue";

export const DEVTOOLS_OPEN_ERROR = "Close DevTools to use viewport sizes.";
export const PAGE_NOT_ANSWERING_ERROR = "The page does not answer. Try again when the page works.";
const RELEASED_ERROR = "The viewport size was cleared for an agent.";
// The time that the agent handover waits for the page. After it, AI1
// detaches its debugger at once.
export const RELEASE_TIMEOUT_MS = 2000;
// The time that one Emulation command waits for the page.
export const COMMAND_TIMEOUT_MS = 5000;

export interface EmulationLimits {
  releaseTimeoutMs: number;
  commandTimeoutMs: number;
}

// The part of `webContents.debugger` that the emulation uses. Electron gives
// one debugger client for each page: the agent proxy uses the same object.
export interface EmulationDebugger {
  isAttached(): boolean;
  attach(version: string): void;
  detach(): void;
  sendCommand(method: string, params?: object): Promise<unknown>;
  on(event: "detach", listener: () => void): unknown;
}

// The viewport size of one browser tab. AI1 attaches the debugger of the
// page and sends the Emulation commands. The calls run one at a time, in
// order.
export class ViewportEmulation {
  protected readonly queue = new SerialQueue();
  // True while the debugger session is the session of this emulation.
  protected owned = false;
  // `release` increments this value. An `apply` that started before the
  // `release` does nothing.
  protected generation = 0;
  protected currentUserAgent: string | undefined;
  // Each command also waits on this promise. A forced detach rejects it, so
  // a command that the page does not answer cannot block the queue. The
  // code does not rely on Electron to reject a pending command on detach.
  protected abort = ViewportEmulation.newAbort();

  constructor(
    protected readonly debug: EmulationDebugger,
    protected readonly defaultUserAgent: () => string,
    protected readonly limits: EmulationLimits = {
      releaseTimeoutMs: RELEASE_TIMEOUT_MS,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
    },
  ) {
    // Electron sends "detach" for each detach of the debugger: also when the
    // agent proxy detaches it before it attaches its own session. After
    // that, the session is not the session of this emulation.
    debug.on("detach", () => {
      this.owned = false;
      this.currentUserAgent = undefined;
    });
  }

  // The user agent that the emulation sends now, or `undefined` for the
  // default user agent.
  get userAgentOverride(): string | undefined {
    return this.currentUserAgent;
  }

  // Sets the size, or clears it and detaches the debugger (`undefined`).
  apply(settings: ViewportSettings | undefined): Promise<void> {
    const generation = this.generation;
    return this.queue.run(async () => {
      if (generation !== this.generation) {
        return;
      }
      if (settings === undefined) {
        await this.clearAndDetach();
      } else {
        await this.set(settings);
      }
    });
  }

  // The agent handover: clears the overrides and detaches the debugger, if
  // this emulation attached it. It waits for a running `apply`, and an
  // `apply` that waits in the queue does nothing. A page that does not
  // answer (for example, a busy script) cannot stop the agent: after
  // `releaseTimeoutMs`, the emulation detaches at once and stops its
  // running commands.
  async release(): Promise<void> {
    this.generation++;
    const done = this.queue.run(() => this.clearAndDetach());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.limits.releaseTimeoutMs);
    });
    try {
      if ((await Promise.race([done, limit])) === "timeout") {
        this.forceDetach();
      }
    } finally {
      clearTimeout(timer);
    }
  }

  protected static newAbort(): { promise: Promise<never>; reject: (error: Error) => void } {
    let reject!: (error: Error) => void;
    const promise = new Promise<never>((_resolve, rejectPromise) => (reject = rejectPromise));
    // Nothing waits on this promise while no command runs.
    promise.catch(() => undefined);
    return { promise, reject };
  }

  // Stops the running commands and detaches the debugger, if this
  // emulation owns the session.
  protected forceDetach(): void {
    const abort = this.abort;
    this.abort = ViewportEmulation.newAbort();
    abort.reject(new Error(RELEASED_ERROR));
    if (this.owned && this.debug.isAttached()) {
      try {
        this.debug.detach();
      } catch {
        // The page is gone.
      }
    }
    this.owned = false;
    this.currentUserAgent = undefined;
  }

  // Sends one command. It fails when the page does not answer in
  // `commandTimeoutMs`, or when a forced detach stops it.
  protected async send(method: string, params?: object): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(PAGE_NOT_ANSWERING_ERROR)), this.limits.commandTimeoutMs);
    });
    try {
      return await Promise.race([this.debug.sendCommand(method, params), limit, this.abort.promise]);
    } finally {
      clearTimeout(timer);
    }
  }

  protected async set(settings: ViewportSettings): Promise<void> {
    if (!this.owned || !this.debug.isAttached()) {
      try {
        this.debug.attach("1.3");
      } catch {
        // Electron allows one debugger for each page. The owner opened
        // DevTools on this page.
        throw new Error(DEVTOOLS_OPEN_ERROR);
      }
      this.owned = true;
    }
    const { width, height, deviceScaleFactor, mobile } = settings;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    await this.send("Emulation.setTouchEmulationEnabled", {
      enabled: mobile,
      maxTouchPoints: mobile ? 5 : 1,
    });
    await this.send("Emulation.setUserAgentOverride", {
      userAgent: settings.userAgent ?? this.defaultUserAgent(),
    });
    this.currentUserAgent = settings.userAgent;
  }

  protected async clearAndDetach(): Promise<void> {
    if (!this.owned || !this.debug.isAttached()) {
      this.owned = false;
      return;
    }
    try {
      await this.send("Emulation.clearDeviceMetricsOverride");
      await this.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await this.send("Emulation.setUserAgentOverride", { userAgent: this.defaultUserAgent() });
    } catch {
      // The page is gone or navigates. The detach below clears the
      // overrides of the session too.
    }
    // The "detach" event can already have come (the page closed).
    if (this.owned && this.debug.isAttached()) {
      try {
        this.debug.detach();
      } catch {
        // The page is gone.
      }
    }
    this.owned = false;
    this.currentUserAgent = undefined;
  }
}

// The viewport emulations of the browser tabs, one for each guest.
@injectable()
export class ViewportEmulations {
  protected readonly emulations = new Map<number, ViewportEmulation>();

  getOrCreate(guestId: number, create: () => ViewportEmulation): ViewportEmulation {
    let emulation = this.emulations.get(guestId);
    if (!emulation) {
      emulation = create();
      this.emulations.set(guestId, emulation);
    }
    return emulation;
  }

  // Before an agent gets the debugger of this guest.
  release(guestId: number): Promise<void> {
    return this.emulations.get(guestId)?.release() ?? Promise.resolve();
  }

  // The guest is gone.
  remove(guestId: number): void {
    this.emulations.delete(guestId);
  }
}
