import { Profile } from "./profiles";

// The name of the preload API on `window`.
export const AI1_BROWSER_API = "electronAi1Browser";

// The IPC channels between the front end and the main process. The first
// group is `ipcRenderer.invoke` → `ipcMain.handle`. The second group is
// `webContents.send` → `ipcRenderer.on`.
export const Channels = {
  listProfiles: "ai1-browser:list-profiles",
  addProfile: "ai1-browser:add-profile",
  renameProfile: "ai1-browser:rename-profile",
  deleteProfile: "ai1-browser:delete-profile",
  registerGuest: "ai1-browser:register-guest",
  setAgentTab: "ai1-browser:set-agent-tab",
  acceptCertificate: "ai1-browser:accept-certificate",
  configureAgentAddress: "ai1-browser:configure-agent-address",
  agentAddress: "ai1-browser:agent-address",
  agentTabCreated: "ai1-browser:agent-tab-created",

  profilesChanged: "ai1-browser:profiles-changed",
  openTab: "ai1-browser:open-tab",
  createAgentTab: "ai1-browser:create-agent-tab",
  agentState: "ai1-browser:agent-state",
  certificateError: "ai1-browser:certificate-error",
  notice: "ai1-browser:notice",
} as const;

export interface OpenTabRequest {
  url: string;
  profileId: string;
}

export interface CreateAgentTabRequest {
  requestId: string;
}

// `tabId` is the agent tab of the window that gets the message, or
// `undefined` when that window has none.
export interface AgentState {
  tabId: string | undefined;
  connected: boolean;
}

export interface CertificateErrorEvent {
  webContentsId: number;
  url: string;
  host: string;
  error: string;
}

export interface AgentAddressConfig {
  enabled: boolean;
  port: number;
}

export type AgentAddressResult = { ok: true } | { ok: false; error: string };

export interface Ai1BrowserApi {
  listProfiles(): Promise<Profile[]>;
  addProfile(name: string): Promise<Profile>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  registerGuest(webContentsId: number, tabId: string): Promise<void>;
  setAgentTab(tabId: string | undefined): Promise<void>;
  acceptCertificate(webContentsId: number, host: string): Promise<void>;
  configureAgentAddress(config: AgentAddressConfig): Promise<AgentAddressResult>;
  // The full agent address with its secret, or `undefined` when it is off.
  agentAddress(): Promise<string | undefined>;
  agentTabCreated(requestId: string, tabId: string): Promise<void>;
  onProfilesChanged(listener: (profiles: Profile[]) => void): () => void;
  onOpenTab(listener: (request: OpenTabRequest) => void): () => void;
  onCreateAgentTab(listener: (request: CreateAgentTabRequest) => void): () => void;
  onAgentState(listener: (state: AgentState) => void): () => void;
  onCertificateError(listener: (event: CertificateErrorEvent) => void): () => void;
  onNotice(listener: (text: string) => void): () => void;
}
