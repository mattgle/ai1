import { app, BrowserWindow, webContents } from "@theia/core/electron-shared/electron";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as path from "node:path";
import {
  AgentAddressConfig,
  AgentAddressResult,
  AgentState,
  Channels,
  CreateAgentTabRequest,
} from "../common/browser-ipc";
import { AgentAddressServer, AgentTarget } from "./agent-address-server";
import { AgentProxies } from "./agent-proxies";
import { readOrCreateSecret } from "./agent-secret";
import { AgentTabs } from "./agent-tabs";
import { captureScreenshot } from "./cdp-screenshot";
import { GuestPolicies } from "./guest-policies";
import { GuestRegistry } from "./guest-registry";
import { OnePageProxy } from "./one-page-proxy";
import { SerialQueue } from "./serial-queue";

@injectable()
export class AgentAddress {
  @inject(GuestRegistry)
  protected readonly registry!: GuestRegistry;

  @inject(GuestPolicies)
  protected readonly guestPolicies!: GuestPolicies;

  tabs!: AgentTabs;
  protected server: AgentAddressServer | undefined;
  protected config: AgentAddressConfig = { enabled: false, port: 0 };
  protected readonly proxies = new AgentProxies<OnePageProxy>();
  protected lastFocusedWindow: number | undefined;
  // Runs each `configure` call after the previous one has finished, so two
  // quick changes cannot leave a server without a reference.
  protected readonly configureQueue = new SerialQueue();

  @postConstruct()
  protected init(): void {
    this.tabs = new AgentTabs(this.registry, {
      lastFocusedWindow: () => this.focusedTheiaWindow(),
      requestAgentTab: (windowId, requestId) => {
        const request: CreateAgentTabRequest = { requestId };
        webContents.fromId(windowId)?.send(Channels.createAgentTab, request);
      },
      guestAlive: (guestId) => {
        const guest = webContents.fromId(guestId);
        return guest !== undefined && !guest.isDestroyed();
      },
      // Close the agent's connection to the old agent tab. The next
      // connection gets the new agent tab.
      releaseGuest: (guestId) => this.proxies.release(guestId),
    });
  }

  // Called from `onStart`, after the app is ready.
  trackFocus(): void {
    app.on("browser-window-focus", (_event, window) => {
      if (!this.guestPolicies.isAi1BrowserContents(window.webContents)) {
        this.lastFocusedWindow = window.webContents.id;
      }
    });
  }

  address(): string | undefined {
    return this.server?.address();
  }

  // Runs after the previous `configure` call has finished, so two quick
  // changes cannot leave a server without a reference.
  configure(config: AgentAddressConfig): Promise<AgentAddressResult> {
    return this.configureQueue.run(() => this.configureNow(config));
  }

  protected async configureNow(config: AgentAddressConfig): Promise<AgentAddressResult> {
    if (config.enabled === this.config.enabled && config.port === this.config.port) {
      return { ok: true };
    }
    // Read or create the secret file before any state changes. On failure,
    // the state stays as it was (off, or the previous configuration).
    let secret: string | undefined;
    if (config.enabled) {
      try {
        secret = readOrCreateSecret(path.join(app.getPath("userData"), "ai1-browser-agent-secret"));
      } catch (error) {
        return { ok: false, error: `The agent secret cannot be read or created: ${String(error)}` };
      }
    }
    this.config = config;
    await this.server?.stop();
    this.server = undefined;
    // Closing the server does not close the WebSocket connections: end the
    // client of every agent tab.
    this.proxies.stopAll();
    if (!config.enabled) {
      return { ok: true };
    }
    const server = new AgentAddressServer(secret!, () => this.resolveTarget());
    try {
      await server.start(config.port);
    } catch (error) {
      this.config = { enabled: false, port: config.port };
      const inUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
      return {
        ok: false,
        error: inUse
          ? `The port ${config.port} is in use. Choose another port in the setting ai1.browser.agentAddress.port.`
          : `The agent address cannot start: ${String(error)}`,
      };
    }
    this.server = server;
    return { ok: true };
  }

  protected focusedTheiaWindow(): number | undefined {
    const windows = BrowserWindow.getAllWindows().filter(
      (window) => !window.isDestroyed() && !this.guestPolicies.isAi1BrowserContents(window.webContents),
    );
    const last = windows.find((window) => window.webContents.id === this.lastFocusedWindow);
    return (last ?? windows[0])?.webContents.id;
  }

  protected async resolveTarget(): Promise<AgentTarget> {
    const guestId = await this.tabs.resolve();
    const guest = webContents.fromId(guestId);
    const entry = this.registry.entry(guestId);
    if (!guest || guest.isDestroyed() || !entry) {
      throw new Error("The agent tab closed.");
    }
    if (guest.isDevToolsOpened()) {
      const text =
        "An agent cannot connect while DevTools is open on the agent tab. Close DevTools, then connect again.";
      webContents.fromId(entry.windowId)?.send(Channels.notice, text);
      throw new Error(text);
    }
    let proxy = this.proxies.get(guestId);
    if (!proxy) {
      const created = new OnePageProxy(guest, {
        onClientChange: (connected) => this.sendState(entry.windowId, connected),
        captureScreenshot: (params) =>
          new Promise((resolve, reject) =>
            captureScreenshot(guest, params, resolve, (message) => reject(new Error(message))),
          ),
      });
      guest.once("destroyed", () => this.proxies.remove(guestId));
      this.proxies.add(guestId, created);
      proxy = created;
    }
    return {
      handleHttpRequest: (requestPath, response) => {
        if (["/json/list", "/json/list/", "/json", "/json/"].includes(requestPath)) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify([proxy!.listEntry(this.server?.webSocketUrl() ?? "")]));
          return;
        }
        response.writeHead(404).end();
      },
      acceptClient: (client) => this.proxies.accept(guestId, client),
    };
  }

  // True when an agent is connected to the agent tab of this window.
  agentConnected(windowId: number): boolean {
    const tabId = this.tabs.agentTabOf(windowId);
    return this.proxies.isConnected(tabId === undefined ? undefined : this.registry.guestOf(windowId, tabId));
  }

  sendState(windowId: number, connected: boolean): void {
    const state: AgentState = { tabId: this.tabs.agentTabOf(windowId), connected };
    webContents.fromId(windowId)?.send(Channels.agentState, state);
  }
}
