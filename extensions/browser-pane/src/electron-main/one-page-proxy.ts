import { randomBytes } from "node:crypto";
import { isAllowedGuestUrl } from "../common/address";

// The part of a `<webview>` guest's `WebContents` that the proxy uses.
export interface ProxyGuest {
  debugger: {
    isAttached(): boolean;
    attach(protocolVersion?: string): void;
    detach(): void;
    sendCommand(method: string, params?: object, sessionId?: string): Promise<unknown>;
    on(
      event: "message",
      listener: (event: unknown, method: string, params: unknown, sessionId?: string) => void,
    ): unknown;
    on(event: "detach", listener: (event: unknown, reason: string) => void): unknown;
  };
  isDestroyed(): boolean;
  getTitle(): string;
  getURL(): string;
  getUserAgent(): string;
}

// The part of a `ws` WebSocket that the proxy uses.
export interface ProxyClient {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (data: unknown) => void): unknown;
  on(event: "close", listener: () => void): unknown;
}

export interface OnePageProxyHooks {
  onClientChange(connected: boolean): void;
  captureScreenshot(params: Record<string, unknown> | undefined): Promise<unknown>;
}

interface Message {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

const OPEN = 1;
const BROWSER_CONTEXT_ID = "ai1-agent-context";
const WEB_ONLY = "The AI1 agent tab opens only http and https addresses.";

// A Chrome DevTools Protocol endpoint with exactly one page: the agent tab.
// It answers the browser-level commands itself and forwards the page
// commands to `webContents.debugger`. Playwright's flatten auto-attach needs
// the real target id and page events that carry the page session id.
export class OnePageProxy {
  protected client: ProxyClient | undefined;
  protected pageSessionId: string | undefined;
  protected targetId: string | undefined;
  protected readonly childSessions = new Set<string>();
  // True while the proxy itself detaches the debugger.
  protected ownDetach = false;

  constructor(
    protected readonly guest: ProxyGuest,
    protected readonly hooks: OnePageProxyHooks,
  ) {
    guest.debugger.on("message", (_event, method, params, sessionId) =>
      this.onDebuggerEvent(method, params, sessionId),
    );
    guest.debugger.on("detach", () => this.onDebuggerDetach());
  }

  // One client at a time: a new client replaces the old one. Each client
  // gets a fresh debugger session, so its domain state starts clean.
  acceptClient(client: ProxyClient): void {
    const previous = this.client;
    this.client = client;
    this.pageSessionId = undefined;
    this.childSessions.clear();
    if (previous) {
      previous.close();
      this.hooks.onClientChange(false);
    }
    const ready = this.attachDebugger();
    let chain: Promise<void> = ready;
    client.on("message", (data) => {
      chain = chain.then(() => this.onClientMessage(client, String(data))).catch(() => undefined);
    });
    client.on("close", () => {
      if (this.client !== client) {
        return;
      }
      this.client = undefined;
      this.pageSessionId = undefined;
      this.detachDebugger();
      this.hooks.onClientChange(false);
    });
    this.hooks.onClientChange(true);
  }

  // The `/json/list` entry. The id is the last known real id.
  listEntry(webSocketUrl: string): object {
    return {
      id: this.targetId ?? "",
      type: "page",
      title: this.guest.isDestroyed() ? "" : this.guest.getTitle(),
      url: this.guest.isDestroyed() ? "" : this.guest.getURL(),
      webSocketDebuggerUrl: webSocketUrl,
    };
  }

  stop(): void {
    this.client?.close();
    this.client = undefined;
    this.detachDebugger();
  }

  protected async attachDebugger(): Promise<void> {
    this.detachDebugger();
    this.guest.debugger.attach("1.3");
    this.targetId = (await this.realTargetInfo()).targetId;
  }

  protected detachDebugger(): void {
    try {
      if (this.guest.debugger.isAttached()) {
        this.ownDetach = true;
        this.guest.debugger.detach();
      }
    } catch {
      // The page is gone.
    } finally {
      this.ownDetach = false;
    }
  }

  protected async realTargetInfo(): Promise<{ targetId: string }> {
    const answer = (await this.guest.debugger.sendCommand("Target.getTargetInfo")) as {
      targetInfo: { targetId: string };
    };
    return answer.targetInfo;
  }

  protected pageTargetInfo(): Record<string, unknown> {
    return {
      targetId: this.targetId,
      type: "page",
      title: this.guest.getTitle(),
      url: this.guest.getURL(),
      attached: true,
      canAccessOpener: false,
      browserContextId: BROWSER_CONTEXT_ID,
    };
  }

  protected send(client: ProxyClient, message: object): void {
    if (client === this.client && client.readyState === OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  protected reply(client: ProxyClient, message: Message, result: unknown): void {
    this.send(client, {
      id: message.id,
      result,
      ...(message.sessionId ? { sessionId: message.sessionId } : {}),
    });
  }

  protected fail(client: ProxyClient, message: Message, text: string): void {
    this.send(client, {
      id: message.id,
      error: { code: -32000, message: text },
      ...(message.sessionId ? { sessionId: message.sessionId } : {}),
    });
  }

  protected async onClientMessage(client: ProxyClient, raw: string): Promise<void> {
    let message: Message;
    try {
      message = JSON.parse(raw) as Message;
    } catch {
      return;
    }
    if (typeof message.id !== "number" || typeof message.method !== "string") {
      return;
    }
    if (!message.sessionId) {
      return this.onRootCommand(client, message);
    }
    if (message.sessionId !== this.pageSessionId && !this.childSessions.has(message.sessionId)) {
      return this.fail(client, message, "No session with given id");
    }
    return this.onPageCommand(client, message);
  }

  protected async onPageCommand(client: ProxyClient, message: Message): Promise<void> {
    const refusal = this.pageRefusal(message);
    if (refusal !== undefined) {
      return this.fail(client, message, refusal);
    }
    if (message.method === "Page.bringToFront") {
      return this.reply(client, message, {});
    }
    // Without a target id, the debugger would answer for its own target.
    // On the page session, that is the page, so answer it here.
    if (message.method === "Target.getTargetInfo" && message.sessionId === this.pageSessionId) {
      return this.reply(client, message, { targetInfo: this.pageTargetInfo() });
    }
    try {
      if (message.method === "Page.captureScreenshot") {
        return this.reply(client, message, await this.hooks.captureScreenshot(message.params));
      }
      const child = message.sessionId === this.pageSessionId ? undefined : message.sessionId;
      const result = await this.guest.debugger.sendCommand(message.method, message.params ?? {}, child);
      this.reply(client, message, result ?? {});
    } catch (error) {
      this.fail(client, message, error instanceof Error ? error.message : String(error));
    }
  }

  // The debugger of a guest can reach every target of AI1 (the IDE window,
  // the other tabs and profiles) through the Target domain. The agent gets
  // only what it needs for its one page and the frames and workers of that
  // page. Gives the error text, or `undefined` when the command can go on.
  protected pageRefusal(message: Message): string | undefined {
    const params = message.params ?? {};
    const notAllowed = `${message.method} is not allowed on the AI1 agent tab.`;
    if (message.method.startsWith("Browser.") || message.method === "Page.setDownloadBehavior") {
      return notAllowed;
    }
    if (message.method === "Page.navigate") {
      return isAllowedGuestUrl(String(params.url)) ? undefined : WEB_ONLY;
    }
    if (!message.method.startsWith("Target.")) {
      return undefined;
    }
    switch (message.method) {
      case "Target.setAutoAttach":
        return undefined;
      case "Target.detachFromTarget":
        return typeof params.sessionId === "string" && this.childSessions.has(params.sessionId)
          ? undefined
          : notAllowed;
      case "Target.getTargetInfo":
        return params.targetId === undefined ? undefined : notAllowed;
      default:
        return notAllowed;
    }
  }

  protected async onRootCommand(client: ProxyClient, message: Message): Promise<void> {
    const params = message.params ?? {};
    switch (message.method) {
      case "Browser.getVersion":
        return this.reply(client, message, {
          protocolVersion: "1.3",
          product: `Chrome/${process.versions.chrome ?? "134.0.0.0"}`,
          revision: "",
          userAgent: this.guest.getUserAgent(),
          jsVersion: process.versions.v8,
        });
      case "Target.setAutoAttach":
        if (params.autoAttach && !this.pageSessionId) {
          this.attachPage(client);
        }
        return this.reply(client, message, {});
      case "Target.setDiscoverTargets":
        this.reply(client, message, {});
        if (params.discover) {
          this.send(client, {
            method: "Target.targetCreated",
            params: { targetInfo: this.pageTargetInfo() },
          });
        }
        return;
      case "Target.getTargets":
        return this.reply(client, message, { targetInfos: [this.pageTargetInfo()] });
      case "Target.getTargetInfo":
        if (params.targetId === this.targetId) {
          return this.reply(client, message, { targetInfo: this.pageTargetInfo() });
        }
        return this.reply(client, message, {
          targetInfo: {
            targetId: "browser",
            type: "browser",
            title: "",
            url: "",
            attached: true,
            canAccessOpener: false,
          },
        });
      case "Target.getBrowserContexts":
        return this.reply(client, message, { browserContextIds: [BROWSER_CONTEXT_ID] });
      case "Target.attachToTarget":
        if (params.targetId !== this.targetId) {
          return this.fail(client, message, "No target with given id found");
        }
        if (!this.pageSessionId) {
          this.attachPage(client);
        }
        return this.reply(client, message, { sessionId: this.pageSessionId });
      case "Target.createTarget":
        if (typeof params.url === "string" && params.url !== "" && !isAllowedGuestUrl(params.url)) {
          return this.fail(client, message, WEB_ONLY);
        }
        if (!this.pageSessionId) {
          this.attachPage(client);
        }
        if (typeof params.url === "string" && params.url !== "about:blank") {
          this.guest.debugger.sendCommand("Page.navigate", { url: params.url }).catch(() => undefined);
        }
        return this.reply(client, message, { targetId: this.targetId });
      case "Target.activateTarget":
      case "Browser.setDownloadBehavior":
      case "Target.setRemoteLocations":
        return this.reply(client, message, {});
      case "Browser.close":
        this.reply(client, message, {});
        client.close();
        return;
      default:
        return this.fail(client, message, `${message.method} is not allowed on the AI1 agent tab.`);
    }
  }

  // Chrome sends `Target.attachedToTarget` for an existing page before the
  // reply to `Target.setAutoAttach`; Playwright relies on that order.
  protected attachPage(client: ProxyClient): void {
    this.pageSessionId = randomBytes(16).toString("hex").toUpperCase();
    this.send(client, {
      method: "Target.attachedToTarget",
      params: { sessionId: this.pageSessionId, targetInfo: this.pageTargetInfo(), waitingForDebugger: false },
    });
  }

  protected onDebuggerEvent(method: string, params: unknown, sessionId: string | undefined): void {
    const client = this.client;
    if (!client || !this.pageSessionId) {
      return;
    }
    const childId = (params as { sessionId?: string } | undefined)?.sessionId;
    if (method === "Target.attachedToTarget" && childId) {
      this.childSessions.add(childId);
    }
    if (method === "Target.detachedFromTarget" && childId) {
      this.childSessions.delete(childId);
    }
    // Electron gives an empty session id for an event of the page itself.
    this.send(client, { method, params, sessionId: sessionId || this.pageSessionId });
  }

  // Electron sends "detach" also for the proxy's own `detach()`, before that
  // call returns. Only a detach that the proxy did not ask for (the page
  // closed, or DevTools took the debugger) closes the client.
  protected onDebuggerDetach(): void {
    const client = this.client;
    if (!client || this.ownDetach) {
      return;
    }
    if (this.pageSessionId) {
      this.send(client, {
        method: "Target.detachedFromTarget",
        params: { sessionId: this.pageSessionId, targetId: this.targetId },
      });
    }
    this.client = undefined;
    this.pageSessionId = undefined;
    client.close();
    this.hooks.onClientChange(false);
  }
}
