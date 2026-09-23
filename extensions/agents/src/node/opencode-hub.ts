import { injectable } from "@theia/core/shared/inversify";
import { discoverConnection, ensureService, EventHandler, OpenCodeClient } from "./opencode-client";

export interface Disposable {
  dispose(): void;
}

// Connects to the OpenCode service on the first use. If the service does not
// run, starts it one time and waits up to 10 seconds.
async function connectWithStart(): Promise<OpenCodeClient> {
  try {
    return new OpenCodeClient(await discoverConnection());
  } catch (error) {
    if (!/does not run/.test(String(error))) {
      throw error;
    }
  }
  await ensureService();
  const deadline = Date.now() + 10_000;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      return new OpenCodeClient(await discoverConnection());
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last;
}

// One OpenCode connection and one `GET /api/event` subscription for the
// whole app, shared by every open window: `AgentsServiceImpl` is bound per
// RPC connection (`ConnectionContainerModule`, one instance per window,
// with its own roots and tracked sessions -- see that class's own
// comment), but the OpenCode HTTP connection and its one SSE stream would
// otherwise be opened once per window too, each with its own retry timer
// and its own initial-load cost. This class lives in the main container,
// one instance for the life of the process, injected into every
// per-connection `AgentsServiceImpl`, and fans events and connection-state
// changes out to whichever of them are currently listening.
@injectable()
export class OpenCodeHub {
  protected api: OpenCodeClient | undefined;
  protected connecting: Promise<OpenCodeClient> | undefined;
  protected subscription: { dispose(): void } | undefined;
  protected readonly eventListeners = new Set<EventHandler>();
  protected readonly stateListeners = new Set<(connected: boolean) => void>();
  protected lastState = false;
  protected connect: () => Promise<OpenCodeClient> = connectWithStart;
  protected retry: { retryMs?: number; maxRetryMs?: number } = {};

  // Test-only seam, the same shape `AgentsServiceImpl.init` had before this
  // connection moved here; the production module leaves both at their
  // defaults.
  init(connect: () => Promise<OpenCodeClient>, retry: { retryMs?: number; maxRetryMs?: number } = {}): void {
    this.connect = connect;
    this.retry = retry;
  }

  // Connects on the first call; every later call, from any window, reuses
  // the same in-flight or already-resolved connection -- never a second
  // `connect()`.
  async apiClient(): Promise<OpenCodeClient> {
    if (!this.connecting) {
      // A failed connect is not kept: the next call (for example Refresh,
      // after the user fixes the cause) tries again.
      this.connecting = this.connect().catch((error: unknown) => {
        this.connecting = undefined;
        throw error;
      });
    }
    this.api = await this.connecting;
    this.ensureSubscribed();
    return this.api;
  }

  // Registers `listener` for every event the one shared subscription
  // delivers, from now on, until the returned handle is disposed.
  onEvent(listener: EventHandler): Disposable {
    this.eventListeners.add(listener);
    return {
      dispose: () => {
        this.eventListeners.delete(listener);
      },
    };
  }

  // Registers `listener` for every connection-state change from now on.
  // Also calls it once, at once, with the current state -- a window
  // opened after the first already has a live connection (or a cut one)
  // by the time it asks, and its own `connected` flag must not start
  // wrong until the next real change.
  onState(listener: (connected: boolean) => void): Disposable {
    this.stateListeners.add(listener);
    listener(this.lastState);
    return {
      dispose: () => {
        this.stateListeners.delete(listener);
      },
    };
  }

  protected ensureSubscribed(): void {
    if (this.subscription || !this.api) {
      return;
    }
    this.subscription = this.api.subscribe(
      (type, properties) => {
        for (const listener of this.eventListeners) {
          listener(type, properties);
        }
      },
      (connected) => {
        this.lastState = connected;
        for (const listener of this.stateListeners) {
          listener(connected);
        }
      },
      this.retry,
    );
  }

  // Closes the one shared subscription. Not wired to any per-connection
  // lifecycle (a window closing must never stop the hub for the others
  // still open) -- for tests, to stop the retry timer of a subscription
  // whose fake server just stopped, and for a full process shutdown.
  dispose(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
  }
}
