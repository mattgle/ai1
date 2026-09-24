import { contextBridge, ipcRenderer } from "@theia/core/electron-shared/electron";
import {
  AgentAddressConfig,
  AgentState,
  AI1_BROWSER_API,
  Ai1BrowserApi,
  CertificateErrorEvent,
  Channels,
  CreateAgentTabRequest,
  OpenTabRequest,
} from "../common/browser-ipc";
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
  setAgentTab: (tabId) => ipcRenderer.invoke(Channels.setAgentTab, tabId),
  acceptCertificate: (webContentsId, host) =>
    ipcRenderer.invoke(Channels.acceptCertificate, webContentsId, host),
  configureAgentAddress: (config: AgentAddressConfig) =>
    ipcRenderer.invoke(Channels.configureAgentAddress, config),
  agentAddress: () => ipcRenderer.invoke(Channels.agentAddress),
  agentTabCreated: (requestId, tabId) => ipcRenderer.invoke(Channels.agentTabCreated, requestId, tabId),
  onProfilesChanged: listen<Profile[]>(Channels.profilesChanged),
  onOpenTab: listen<OpenTabRequest>(Channels.openTab),
  onCreateAgentTab: listen<CreateAgentTabRequest>(Channels.createAgentTab),
  onAgentState: listen<AgentState>(Channels.agentState),
  onCertificateError: listen<CertificateErrorEvent>(Channels.certificateError),
  onNotice: listen<string>(Channels.notice),
};

export function preload(): void {
  contextBridge.exposeInMainWorld(AI1_BROWSER_API, api);
}
