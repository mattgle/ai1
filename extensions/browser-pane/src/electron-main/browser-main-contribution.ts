import { app, BrowserWindow, ipcMain, session, webContents } from "@theia/core/electron-shared/electron";
import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { inject, injectable } from "@theia/core/shared/inversify";
import * as path from "node:path";
import { AgentAddressConfig, Channels } from "../common/browser-ipc";
import { AgentAddress } from "./agent-address";
import { GuestPolicies } from "./guest-policies";
import { GuestRegistry } from "./guest-registry";
import { ProfileStore } from "./profile-store";

@injectable()
export class BrowserMainContribution implements ElectronMainApplicationContribution {
  @inject(GuestPolicies)
  protected readonly guestPolicies!: GuestPolicies;

  @inject(GuestRegistry)
  protected readonly registry!: GuestRegistry;

  @inject(AgentAddress)
  protected readonly agentAddress!: AgentAddress;

  protected store!: ProfileStore;

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
    ipcMain.handle(Channels.agentTabCreated, (event, requestId: string, tabId: string) =>
      this.agentAddress.tabs.tabCreated(event.sender.id, requestId, tabId),
    );
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !this.guestPolicies.isAi1BrowserContents(window.webContents)) {
        window.webContents.send(channel, payload);
      }
    }
  }
}
