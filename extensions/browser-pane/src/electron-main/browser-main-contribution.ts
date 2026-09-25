import { app, BrowserWindow, ipcMain, session, webContents } from "@theia/core/electron-shared/electron";
import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { inject, injectable } from "@theia/core/shared/inversify";
import * as path from "node:path";
import { AgentAddressConfig, Channels, SetViewportResult, ZoomChangedEvent } from "../common/browser-ipc";
import { resolveViewport, ViewportChoice } from "../common/viewport";
import { zoomKey } from "../common/zoom";
import { AgentAddress } from "./agent-address";
import { GuestPolicies } from "./guest-policies";
import { GuestRegistry } from "./guest-registry";
import { ProfileStore } from "./profile-store";
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

  onStart(_application: ElectronMainApplication): void {
    this.guestPolicies.install();
    this.store = new ProfileStore(
      path.join(app.getPath("userData"), "ai1-browser-profiles.json"),
      (partition) => session.fromPartition(partition).clearStorageData(),
    );
    this.store.load();

    ipcMain.handle(Channels.listProfiles, () => this.store.list());
    ipcMain.handle(Channels.addProfile, (_event, name: string) => {
      const profile = this.store.add(name);
      this.broadcast(Channels.profilesChanged, this.store.list());
      return profile;
    });
    ipcMain.handle(Channels.renameProfile, (_event, id: string, name: string) => {
      this.store.rename(id, name);
      this.broadcast(Channels.profilesChanged, this.store.list());
    });
    ipcMain.handle(Channels.deleteProfile, async (_event, id: string) => {
      await this.store.delete(id);
      this.broadcast(Channels.profilesChanged, this.store.list());
    });
    ipcMain.handle(Channels.registerGuest, (event, guestId: number, tabId: string) => {
      const guest = webContents.fromId(guestId);
      if (!guest || guest.getType() !== "webview" || guest.hostWebContents?.id !== event.sender.id) {
        throw new Error("This page is not a browser tab of this window.");
      }
      this.registry.register(guestId, tabId, event.sender.id);
      this.agentAddress.tabs.guestRegistered(event.sender.id, tabId, guestId);
      guest.once("destroyed", () => this.registry.forget(guestId));
    });
    ipcMain.handle(Channels.acceptCertificate, (_event, guestId: number, host: string) =>
      this.guestPolicies.acceptCertificate(guestId, host),
    );
    this.agentAddress.trackFocus();
    ipcMain.handle(Channels.configureAgentAddress, (_event, config: AgentAddressConfig) =>
      this.agentAddress.configure(config),
    );
    ipcMain.handle(Channels.agentAddress, () => this.agentAddress.address());
    ipcMain.handle(Channels.giveToAgent, (event, tabId: string | undefined) => {
      if (this.guestPolicies.isAi1BrowserContents(event.sender)) {
        throw new Error("Only an AI1 window can give a tab to an agent.");
      }
      this.agentAddress.tabs.giveTab(event.sender.id, tabId);
    });
    ipcMain.handle(Channels.setFindOpen, (event, guestId: number, open: boolean) => {
      if (this.guestPolicies.isAi1BrowserContents(event.sender)) {
        throw new Error("Only an AI1 window can open a find bar.");
      }
      if (this.registry.entry(guestId)?.windowId === event.sender.id) {
        this.guestPolicies.setFindOpen(guestId, open === true);
      }
    });
    this.zoomStore = new ZoomStore(path.join(app.getPath("userData"), "ai1-browser-zoom.json"));
    this.zoomStore.load();
    ipcMain.handle(Channels.getZoom, (event, profileId: string, url: string) => {
      if (this.guestPolicies.isAi1BrowserContents(event.sender)) {
        throw new Error("Only an AI1 window can read a zoom level.");
      }
      const key =
        typeof profileId === "string" && typeof url === "string" ? zoomKey(profileId, url) : undefined;
      return key === undefined ? 100 : this.zoomStore.get(key);
    });
    ipcMain.handle(Channels.setZoom, (event, profileId: string, url: string, percent: number) => {
      if (this.guestPolicies.isAi1BrowserContents(event.sender)) {
        throw new Error("Only an AI1 window can change a zoom level.");
      }
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
    ipcMain.handle(Channels.setViewport, (event, guestId: number, choice: ViewportChoice) => {
      if (this.guestPolicies.isAi1BrowserContents(event.sender)) {
        throw new Error("Only an AI1 window can set a viewport size.");
      }
      return this.setViewport(event.sender.id, guestId, choice);
    });
    ipcMain.handle(Channels.agentTabCreated, (event, requestId: string, tabId: string) =>
      this.agentAddress.tabs.tabCreated(event.sender.id, requestId, tabId),
    );
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

  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !this.guestPolicies.isAi1BrowserContents(window.webContents)) {
        window.webContents.send(channel, payload);
      }
    }
  }
}
