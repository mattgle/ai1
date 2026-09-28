import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainInvokeEvent,
  session,
  WebContents,
  webContents,
} from "@theia/core/electron-shared/electron";
import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { inject, injectable } from "@theia/core/shared/inversify";
import * as fs from "node:fs";
import * as path from "node:path";
import { AgentAddressConfig, Channels, SetViewportResult, ZoomChangedEvent } from "../common/browser-ipc";
import { resolveViewport, ViewportChoice } from "../common/viewport";
import { zoomKey } from "../common/zoom";
import { AgentAddress } from "./agent-address";
import { DownloadStore } from "./download-store";
import { sanitizeDesignSelection } from "../common/design-selection";
import { CookieImportSource } from "../common/cookie-import";
import { DownloadTracker } from "./download-tracker";
import { detectCookieImportSources, importCookiesToProfile } from "./cookie-import";
import { GuestPolicies } from "./guest-policies";
import { GuestRegistry } from "./guest-registry";
import { HistoryStore } from "./history-store";
import { ProfileStore } from "./profile-store";
import { ShellActions } from "./shell-actions";
import { guardTheiaSender } from "./theia-sender";
import { ViewportEmulation, ViewportEmulations } from "./viewport-emulation";
import { ZoomStore } from "./zoom-store";

@injectable()
export class BrowserMainContribution implements ElectronMainApplicationContribution {
  @inject(GuestPolicies)
  protected readonly guestPolicies!: GuestPolicies;

  @inject(GuestRegistry)
  protected readonly registry!: GuestRegistry;

  @inject(AgentAddress)
  protected readonly agentAddress!: AgentAddress;

  @inject(ViewportEmulations)
  protected readonly viewports!: ViewportEmulations;

  protected store!: ProfileStore;
  protected zoomStore!: ZoomStore;
  protected downloadStore!: DownloadStore;
  protected downloads!: DownloadTracker;
  protected historyStore!: HistoryStore;
  protected readonly shellActions = new ShellActions();

  onStart(_application: ElectronMainApplication): void {
    this.guestPolicies.install();
    this.store = new ProfileStore(
      path.join(app.getPath("userData"), "ai1-browser-profiles.json"),
      (partition) => session.fromPartition(partition).clearStorageData(),
    );
    this.store.load();

    this.handle(Channels.listProfiles, () => this.store.list());
    this.handle(Channels.addProfile, (_event, name: string) => {
      const profile = this.store.add(name);
      this.broadcast(Channels.profilesChanged, this.store.list());
      return profile;
    });
    this.handle(Channels.renameProfile, (_event, id: string, name: string) => {
      this.store.rename(id, name);
      this.broadcast(Channels.profilesChanged, this.store.list());
    });
    this.handle(Channels.deleteProfile, async (_event, id: string) => {
      await this.store.delete(id);
      this.historyStore.deleteProfile(id);
      this.broadcast(Channels.profilesChanged, this.store.list());
    });
    this.handle(Channels.registerGuest, (event, guestId: number, tabId: string) => {
      const guest = webContents.fromId(guestId);
      if (!guest || guest.getType() !== "webview" || guest.hostWebContents?.id !== event.sender.id) {
        throw new Error("This page is not a browser tab of this window.");
      }
      this.registry.register(guestId, tabId, event.sender.id);
      this.agentAddress.tabs.guestRegistered(event.sender.id, tabId, guestId);
      guest.once("destroyed", () => this.registry.forget(guestId));
      // A reload of the window keeps the agent state in this process, but the
      // new front end does not know it. Send the state of all tabs of this
      // window again.
      event.sender.send(Channels.agentState, this.agentAddress.tabs.stateFor(event.sender.id));
    });
    this.handle(Channels.acceptCertificate, (_event, guestId: number, host: string) =>
      this.guestPolicies.acceptCertificate(guestId, host),
    );
    this.agentAddress.trackFocus();
    this.handle(Channels.configureAgentAddress, (_event, config: AgentAddressConfig) =>
      this.agentAddress.configure(config),
    );
    this.handle(Channels.agentAddress, () => this.agentAddress.address());
    this.handle(Channels.giveToAgent, (event, tabId: string | undefined) => {
      this.agentAddress.tabs.giveTab(event.sender.id, tabId);
    });
    this.handle(Channels.setFindOpen, (event, guestId: number, open: boolean) => {
      if (this.registry.entry(guestId)?.windowId === event.sender.id) {
        this.guestPolicies.setFindOpen(guestId, open === true);
      }
    });
    this.zoomStore = new ZoomStore(path.join(app.getPath("userData"), "ai1-browser-zoom.json"));
    this.zoomStore.load();
    this.handle(Channels.getZoom, (_event, profileId: string, url: string) => {
      const key =
        typeof profileId === "string" && typeof url === "string" ? zoomKey(profileId, url) : undefined;
      return key === undefined ? 100 : this.zoomStore.get(key);
    });
    this.handle(Channels.setZoom, (_event, profileId: string, url: string, percent: number) => {
      if (typeof profileId !== "string" || typeof url !== "string" || !this.store.has(profileId)) {
        throw new Error("There is no such profile.");
      }
      // A page with no host (for example `about:blank`) has no zoom entry.
      const key = zoomKey(profileId, url);
      if (key === undefined) {
        return;
      }
      this.zoomStore.set(key, percent);
      const payload: ZoomChangedEvent = { key, percent };
      this.broadcast(Channels.zoomChanged, payload);
    });
    this.handle(Channels.setViewport, (event, guestId: number, choice: ViewportChoice) =>
      this.setViewport(event.sender.id, guestId, choice),
    );
    this.handle(Channels.inspectElement, (event, guestId: number, x: number, y: number) =>
      this.inspectElement(event.sender.id, guestId, x, y),
    );
    this.handle(Channels.listCookieImportSources, () => detectCookieImportSources());
    this.handle(Channels.importCookies, (_event, source: CookieImportSource, targetProfileId: string) => {
      if (!this.store.has(targetProfileId)) {
        throw new Error("The target browser profile does not exist.");
      }
      return importCookiesToProfile(source, targetProfileId, this.store.list());
    });
    this.startDownloads();
    this.startHistory();
    this.handle(Channels.agentTabCreated, (event, requestId: string, tabId: string) =>
      this.agentAddress.tabs.tabCreated(event.sender.id, requestId, tabId),
    );
  }

  // Registers an IPC handler that runs only for a request from the main
  // frame of a Theia window. Every handler of the AI1 browser goes through
  // this method. A page of the AI1 browser is not trusted.
  protected handle<A extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: A) => unknown,
  ): void {
    ipcMain.handle(
      channel,
      guardTheiaSender((contents: WebContents) => this.guestPolicies.isAi1BrowserContents(contents), handler),
    );
  }

  protected startDownloads(): void {
    this.downloadStore = new DownloadStore(
      path.join(app.getPath("userData"), "ai1-browser-downloads.json"),
      (file) => fs.existsSync(file),
    );
    this.downloadStore.load();
    this.downloads = new DownloadTracker(this.downloadStore, (entries) =>
      this.broadcast(Channels.downloadsChanged, entries),
    );
    this.guestPolicies.setDownloadTracker(this.downloads);
    const changed = (): void => this.broadcast(Channels.downloadsChanged, this.downloadStore.list());
    this.handle(Channels.listDownloads, () => {
      if (this.downloadStore.refreshDeleted()) {
        changed();
      }
      return this.downloadStore.list();
    });
    this.handle(Channels.cancelDownload, (_event, id: unknown) => {
      if (typeof id === "string") {
        this.downloads.cancel(id);
      }
    });
    this.handle(Channels.openDownload, async (_event, id: unknown) => {
      const file = this.finishedFile(id, changed);
      if (file === undefined) {
        return "The file of this download is not in its folder.";
      }
      return this.shellActions.openPath(file);
    });
    this.handle(Channels.showDownload, (_event, id: unknown) => {
      const file = this.finishedFile(id, changed);
      if (file === undefined) {
        return "The file of this download is not in its folder.";
      }
      this.shellActions.showItemInFolder(file);
      return "";
    });
    this.handle(Channels.removeDownload, (_event, id: unknown) => {
      if (typeof id === "string" && !this.downloads.isRunning(id)) {
        this.downloadStore.remove(id);
        changed();
      }
    });
    this.handle(Channels.clearDownloads, () => {
      this.downloadStore.clearFinished();
      changed();
    });
  }

  protected startHistory(): void {
    this.historyStore = new HistoryStore(path.join(app.getPath("userData"), "ai1-browser-history"));
    this.guestPolicies.setHistory(this.historyStore);
    app.on("before-quit", () => this.historyStore.flush());
    // The profile id is the name of the history file, so it must be a known
    // profile.
    const handleProfile = (channel: string, handler: (profileId: string) => unknown): void => {
      this.handle(channel, (_event, profileId: unknown) => {
        if (typeof profileId !== "string" || !this.store.has(profileId)) {
          throw new Error("There is no such profile.");
        }
        return handler(profileId);
      });
    };
    handleProfile(Channels.listHistory, (profileId) => this.historyStore.list(profileId));
    handleProfile(Channels.clearHistory, (profileId) => this.historyStore.clear(profileId));
  }

  // The file of a completed download, when it is still in its folder. When
  // it is gone, the entry becomes "deleted".
  protected finishedFile(id: unknown, changed: () => void): string | undefined {
    const entry = typeof id === "string" ? this.downloadStore.get(id) : undefined;
    if (entry?.state !== "completed") {
      return undefined;
    }
    if (!fs.existsSync(entry.savePath)) {
      this.downloadStore.refreshDeleted();
      changed();
      return undefined;
    }
    return entry.savePath;
  }

  protected async setViewport(
    windowId: number,
    guestId: number,
    choice: ViewportChoice,
  ): Promise<SetViewportResult> {
    const guest = webContents.fromId(guestId);
    if (!guest || guest.isDestroyed() || this.registry.entry(guestId)?.windowId !== windowId) {
      return { ok: false, error: "This page is not a browser tab of this window." };
    }
    if (this.agentAddress.agentConnected(guestId)) {
      return { ok: false, error: "An agent is connected to this tab." };
    }
    const settings = resolveViewport(choice);
    if (settings === undefined && choice?.kind !== "off") {
      return { ok: false, error: "This viewport size is not correct." };
    }
    const emulation = this.viewports.getOrCreate(guestId, () => {
      guest.once("destroyed", () => this.viewports.remove(guestId));
      return new ViewportEmulation(guest.debugger, () => guest.getUserAgent());
    });
    const before = emulation.userAgentOverride;
    try {
      await emulation.apply(settings);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    // The page sees a new user agent only in a new document.
    if (emulation.userAgentOverride !== before && !guest.isDestroyed()) {
      guest.reload();
    }
    return { ok: true };
  }

  protected async inspectElement(
    windowId: number,
    guestId: number,
    x: number,
    y: number,
  ): Promise<ReturnType<typeof sanitizeDesignSelection>> {
    const guest = webContents.fromId(guestId);
    if (
      !guest ||
      guest.isDestroyed() ||
      guest.getType() !== "webview" ||
      this.registry.entry(guestId)?.windowId !== windowId ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return undefined;
    }
    const script = `(() => {
      const element = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
      if (!element || element === document.documentElement || element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      const styleNames = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'border', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'];
      const selectedStyles = {};
      for (const name of styleNames) selectedStyles[name] = styles.getPropertyValue(name);
      let selector = element.tagName.toLowerCase();
      if (element.id) selector += '#' + CSS.escape(element.id);
      else if (element.classList.length) selector += '.' + [...element.classList].slice(0, 3).map(CSS.escape).join('.');
      return {
        pageUrl: location.href,
        pageTitle: document.title,
        tagName: element.tagName,
        selector,
        text: (element.innerText || element.textContent || '').trim(),
        html: element.outerHTML,
        styles: selectedStyles,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`;
    try {
      const selection = sanitizeDesignSelection(await guest.executeJavaScript(script, true));
      if (!selection || guest.isDestroyed()) {
        return selection;
      }
      const left = Math.max(0, Math.floor(selection.rect.x));
      const top = Math.max(0, Math.floor(selection.rect.y));
      const width = Math.min(Math.max(1, Math.ceil(selection.rect.width)), 1000);
      const height = Math.min(Math.max(1, Math.ceil(selection.rect.height)), 800);
      if (!width || !height) {
        return selection;
      }
      const image = await guest.capturePage({ x: left, y: top, width, height });
      const scaled = image.resize({ width: Math.min(image.getSize().width, 800) });
      return { ...selection, screenshot: scaled.toDataURL() };
    } catch {
      return undefined;
    }
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !this.guestPolicies.isAi1BrowserContents(window.webContents)) {
        window.webContents.send(channel, payload);
      }
    }
  }
}
