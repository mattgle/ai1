import { app, BrowserWindow, webContents } from "@theia/core/electron-shared/electron";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as path from "node:path";
import {
  AgentAddressConfig,
  AgentAddressResult,
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
import { ViewportEmulations } from "./viewport-emulation";

@injectable()
export class AgentAddress {
  @inject(GuestRegistry)
  protected readonly registry!: GuestRegistry;

  @inject(GuestPolicies)
  protected readonly guestPolicies!: GuestPolicies;

  @inject(ViewportEmulations)
  protected readonly viewports!: ViewportEmulations;

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
    // The page of a connected agent gets all keys: no shortcut is caught.
    this.guestPolicies.setAgentConnectedCheck((guestId) => this.proxies.isConnected(guestId));
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
      // Electron allows one debugger client for each page. The viewport
      // emulation clears its overrides and detaches before the proxy
      // attaches. On a page that does not answer, it detaches after at most
      // `RELEASE_TIMEOUT_MS`. The proxy has no client at this time, so it
      // ignores the "detach" event of this detach.
      beforeAgentAttach: (guestId) => this.viewports.release(guestId),
      stateChanged: () => this.sendState(),
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

  // True while an agent is connected to this guest.
  agentConnected(guestId: number): boolean {
    return this.proxies.isConnected(guestId);
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
      // The mark stays: the tab waits again for the next connection.
      this.tabs.restoreWaiting(entry.windowId, entry.tabId);
      const text =
        "An agent cannot connect while DevTools is open on the agent tab. Close DevTools, then connect again.";
      webContents.fromId(entry.windowId)?.send(Channels.notice, text);
      throw new Error(text);
    }
    if (!this.proxies.get(guestId)) {
      const created = new OnePageProxy(guest, {
        onClientChange: (connected) => {
          if (connected) {
            this.tabs.connected(guestId, this.tabs.nextNumber());
          } else {
            this.tabs.disconnected(guestId);
          }
        },
        captureScreenshot: (params) =>
          new Promise((resolve, reject) =>
            captureScreenshot(guest, params, resolve, (message) => reject(new Error(message))),
          ),
      });
      guest.once("destroyed", () => {
        this.proxies.remove(guestId);
        this.tabs.disconnected(guestId);
      });
      this.proxies.add(guestId, created);
    }
    return { acceptClient: (client) => this.proxies.accept(guestId, client) };
  }

  // Sends to each Theia window the agent state of its own tabs.
  sendState(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !this.guestPolicies.isAi1BrowserContents(window.webContents)) {
        window.webContents.send(Channels.agentState, this.tabs.stateFor(window.webContents.id));
      }
    }
  }
}
