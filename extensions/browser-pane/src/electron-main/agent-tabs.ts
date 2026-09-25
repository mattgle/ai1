import { randomBytes } from "node:crypto";
import { AgentTabState } from "../common/browser-ipc";
import { GuestRegistry } from "./guest-registry";

export interface AgentTabsHost {
  // The Theia window (its web contents id) that had the focus last.
  lastFocusedWindow(): number | undefined;
  // Asks that window to open a tab in the Agent profile.
  requestAgentTab(windowId: number, requestId: string): void;
  guestAlive(guestId: number): boolean;
  // Runs before an agent gets the debugger of this guest. The host clears
  // its own use of the guest here.
  beforeAgentAttach(guestId: number): Promise<void>;
  // The waiting tab or the connected guests changed.
  stateChanged(): void;
}

interface Pending {
  windowId: number;
  tabId?: string;
  resolve: (guestId: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WaitingTab {
  windowId: number;
  tabId: string;
}

// Which tab the next agent connection gets, and which guests have a
// connected agent with which number. Each connection gets its own tab: the
// one waiting tab (in all windows) if it is open, else a new tab.
export class AgentTabs {
  protected waiting: WaitingTab | undefined;
  // The guests with a connected agent, and the number of each connection.
  protected readonly connections = new Map<number, number>();
  protected lastNumber = 0;
  protected readonly pending = new Map<string, Pending>();

  constructor(
    protected readonly registry: GuestRegistry,
    protected readonly host: AgentTabsHost,
    protected readonly timeoutMs = 15_000,
  ) {}

  // Sets the waiting tab, or clears it (`undefined`) when it is a tab of
  // this window. A tab with a connected agent cannot wait.
  giveTab(windowId: number, tabId: string | undefined): void {
    if (tabId === undefined) {
      if (this.waiting?.windowId === windowId) {
        this.setWaiting(undefined);
      }
      return;
    }
    const guestId = this.registry.guestOf(windowId, tabId);
    if (guestId !== undefined && this.connections.has(guestId)) {
      return;
    }
    this.setWaiting({ windowId, tabId });
  }

  waitingTab(): WaitingTab | undefined {
    return this.waiting === undefined ? undefined : { ...this.waiting };
  }

  // The connection that took this tab was refused. The tab waits again,
  // unless the owner gave another tab in the meantime.
  restoreWaiting(windowId: number, tabId: string): void {
    if (this.waiting === undefined) {
      this.setWaiting({ windowId, tabId });
    }
  }

  // The number for the next connection. The numbers start at 1 and are
  // never used again in the same run.
  nextNumber(): number {
    this.lastNumber++;
    return this.lastNumber;
  }

  connected(guestId: number, number: number): void {
    this.connections.set(guestId, number);
    const entry = this.registry.entry(guestId);
    if (entry && this.waiting?.windowId === entry.windowId && this.waiting.tabId === entry.tabId) {
      this.waiting = undefined;
    }
    this.host.stateChanged();
  }

  disconnected(guestId: number): void {
    if (this.connections.delete(guestId)) {
      this.host.stateChanged();
    }
  }

  // The tabs of this window that wait or have a connected agent.
  stateFor(windowId: number): AgentTabState[] {
    const states: AgentTabState[] = [];
    if (this.waiting?.windowId === windowId) {
      states.push({ tabId: this.waiting.tabId, state: "waiting" });
    }
    for (const [guestId, number] of this.connections) {
      const entry = this.registry.entry(guestId);
      if (entry?.windowId === windowId) {
        states.push({ tabId: entry.tabId, state: "connected", number });
      }
    }
    return states;
  }

  async resolve(): Promise<number> {
    const guestId = await this.pickGuest();
    await this.host.beforeAgentAttach(guestId);
    return guestId;
  }

  protected pickGuest(): Promise<number> {
    const waiting = this.waiting;
    if (waiting !== undefined) {
      this.setWaiting(undefined);
      const guestId = this.registry.guestOf(waiting.windowId, waiting.tabId);
      if (guestId !== undefined && this.host.guestAlive(guestId) && !this.connections.has(guestId)) {
        return Promise.resolve(guestId);
      }
    }
    const windowId = this.host.lastFocusedWindow();
    if (windowId === undefined) {
      return Promise.reject(new Error("No AI1 window is open."));
    }
    const requestId = randomBytes(8).toString("hex");
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("The AI1 window did not open an agent tab."));
      }, this.timeoutMs);
      this.pending.set(requestId, { windowId, resolve, reject, timer });
      this.host.requestAgentTab(windowId, requestId);
    });
  }

  tabCreated(windowId: number, requestId: string, tabId: string): void {
    const request = this.pending.get(requestId);
    if (!request || request.windowId !== windowId) {
      return;
    }
    request.tabId = tabId;
    const guestId = this.registry.guestOf(windowId, tabId);
    if (guestId !== undefined) {
      this.finish(requestId, guestId);
    }
  }

  guestRegistered(windowId: number, tabId: string, guestId: number): void {
    for (const [requestId, request] of this.pending) {
      if (request.windowId === windowId && request.tabId === tabId) {
        this.finish(requestId, guestId);
      }
    }
  }

  protected setWaiting(waiting: WaitingTab | undefined): void {
    this.waiting = waiting;
    this.host.stateChanged();
  }

  protected finish(requestId: string, guestId: number): void {
    const request = this.pending.get(requestId);
    if (request) {
      clearTimeout(request.timer);
      this.pending.delete(requestId);
      request.resolve(guestId);
    }
  }
}
