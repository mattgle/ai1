import { contextBridge, ipcRenderer } from "@theia/core/electron-shared/electron";
import {
  AgentAddressConfig,
  AgentTabState,
  AI1_BROWSER_API,
  Ai1BrowserApi,
  CertificateErrorEvent,
  Channels,
  CreateAgentTabRequest,
  OpenTabRequest,
  ShortcutEvent,
  ZoomChangedEvent,
} from "../common/browser-ipc";
import { DownloadDone, DownloadEntry } from "../common/downloads";
import { Profile } from "../common/profiles";

function listen<T>(channel: string): (listener: (payload: T) => void) => () => void {
  return (listener) => {
    const handler = (_event: unknown, payload: T): void => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

const api: Ai1BrowserApi = {
  listProfiles: () => ipcRenderer.invoke(Channels.listProfiles),
  addProfile: (name) => ipcRenderer.invoke(Channels.addProfile, name),
  renameProfile: (id, name) => ipcRenderer.invoke(Channels.renameProfile, id, name),
  deleteProfile: (id) => ipcRenderer.invoke(Channels.deleteProfile, id),
  registerGuest: (webContentsId, tabId) => ipcRenderer.invoke(Channels.registerGuest, webContentsId, tabId),
  giveToAgent: (tabId) => ipcRenderer.invoke(Channels.giveToAgent, tabId),
  acceptCertificate: (webContentsId, host) =>
    ipcRenderer.invoke(Channels.acceptCertificate, webContentsId, host),
  configureAgentAddress: (config: AgentAddressConfig) =>
    ipcRenderer.invoke(Channels.configureAgentAddress, config),
  agentAddress: () => ipcRenderer.invoke(Channels.agentAddress),
  agentTabCreated: (requestId, tabId) => ipcRenderer.invoke(Channels.agentTabCreated, requestId, tabId),
  setFindOpen: (guestId, open) => ipcRenderer.invoke(Channels.setFindOpen, guestId, open),
  getZoom: (profileId, url) => ipcRenderer.invoke(Channels.getZoom, profileId, url),
  setZoom: (profileId, url, percent) => ipcRenderer.invoke(Channels.setZoom, profileId, url, percent),
  setViewport: (guestId, choice) => ipcRenderer.invoke(Channels.setViewport, guestId, choice),
  listDownloads: () => ipcRenderer.invoke(Channels.listDownloads),
  cancelDownload: (id) => ipcRenderer.invoke(Channels.cancelDownload, id),
  openDownload: (id) => ipcRenderer.invoke(Channels.openDownload, id),
  showDownload: (id) => ipcRenderer.invoke(Channels.showDownload, id),
  removeDownload: (id) => ipcRenderer.invoke(Channels.removeDownload, id),
  clearDownloads: () => ipcRenderer.invoke(Channels.clearDownloads),
  onProfilesChanged: listen<Profile[]>(Channels.profilesChanged),
  onOpenTab: listen<OpenTabRequest>(Channels.openTab),
  onCreateAgentTab: listen<CreateAgentTabRequest>(Channels.createAgentTab),
  onAgentState: listen<AgentTabState[]>(Channels.agentState),
  onCertificateError: listen<CertificateErrorEvent>(Channels.certificateError),
  onNotice: listen<string>(Channels.notice),
  onShortcut: listen<ShortcutEvent>(Channels.shortcut),
  onZoomChanged: listen<ZoomChangedEvent>(Channels.zoomChanged),
  onDownloadsChanged: listen<DownloadEntry[]>(Channels.downloadsChanged),
  onDownloadDone: listen<DownloadDone>(Channels.downloadDone),
};

export function preload(): void {
  contextBridge.exposeInMainWorld(AI1_BROWSER_API, api);
}
