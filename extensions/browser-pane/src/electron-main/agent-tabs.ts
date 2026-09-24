import { randomBytes } from "node:crypto";
import { GuestRegistry } from "./guest-registry";

export interface AgentTabsHost {
  // The Theia window (its web contents id) that had the focus last.
  lastFocusedWindow(): number | undefined;
  // Asks that window to open a tab in the Agent profile.
  requestAgentTab(windowId: number, requestId: string): void;
  guestAlive(guestId: number): boolean;
}

interface Pending {
  windowId: number;
  tabId?: string;
  resolve: (guestId: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Which tab of each window is the agent tab, and the guest that the agent
// address uses now.
export class AgentTabs {
  protected readonly agentTabs = new Map<number, string>();
  protected readonly pending = new Map<string, Pending>();

  constructor(
    protected readonly registry: GuestRegistry,
    protected readonly host: AgentTabsHost,
    protected readonly timeoutMs = 15_000,
  ) {}

  setAgentTab(windowId: number, tabId: string | undefined): void {
    if (tabId === undefined) {
      this.agentTabs.delete(windowId);
    } else {
      this.agentTabs.set(windowId, tabId);
    }
  }

  agentTabOf(windowId: number): string | undefined {
    return this.agentTabs.get(windowId);
  }

  resolve(): Promise<number> {
    const windowId = this.host.lastFocusedWindow();
    if (windowId === undefined) {
      return Promise.reject(new Error("No AI1 window is open."));
    }
    const tabId = this.agentTabs.get(windowId);
    const guestId = tabId === undefined ? undefined : this.registry.guestOf(windowId, tabId);
    if (guestId !== undefined && this.host.guestAlive(guestId)) {
      return Promise.resolve(guestId);
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
    this.setAgentTab(windowId, tabId);
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

  protected finish(requestId: string, guestId: number): void {
    const request = this.pending.get(requestId);
    if (request) {
      clearTimeout(request.timer);
      this.pending.delete(requestId);
      request.resolve(guestId);
    }
  }
}
