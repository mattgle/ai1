import { Profile } from "./profiles";
import { BrowserShortcut } from "./shortcuts";

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
  giveToAgent: "ai1-browser:give-to-agent",
  acceptCertificate: "ai1-browser:accept-certificate",
  configureAgentAddress: "ai1-browser:configure-agent-address",
  agentAddress: "ai1-browser:agent-address",
  agentTabCreated: "ai1-browser:agent-tab-created",
  setFindOpen: "ai1-browser:set-find-open",

  profilesChanged: "ai1-browser:profiles-changed",
  openTab: "ai1-browser:open-tab",
  createAgentTab: "ai1-browser:create-agent-tab",
  agentState: "ai1-browser:agent-state",
  certificateError: "ai1-browser:certificate-error",
  notice: "ai1-browser:notice",
  shortcut: "ai1-browser:shortcut",
} as const;

// A shortcut that the main process caught on the page of a browser tab.
export interface ShortcutEvent {
  tabId: string;
  shortcut: BrowserShortcut;
}

export interface OpenTabRequest {
  url: string;
  profileId: string;
}

export interface CreateAgentTabRequest {
  requestId: string;
}

// The agent state of one tab. The `agentState` message sends a list of these
// for all tabs of the window that wait for an agent or have a connected
// agent. A tab that is not in the list is a normal tab. `number` is the
// number of the connection, only for the state "connected".
export interface AgentTabState {
  tabId: string;
  state: "waiting" | "connected";
  number?: number;
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
  // Puts the "Waiting for agent" mark on this tab, or removes the mark from
  // the waiting tab of this window (`undefined`).
  giveToAgent(tabId: string | undefined): Promise<void>;
  acceptCertificate(webContentsId: number, host: string): Promise<void>;
  configureAgentAddress(config: AgentAddressConfig): Promise<AgentAddressResult>;
  // The full agent address with its secret, or `undefined` when it is off.
  agentAddress(): Promise<string | undefined>;
  agentTabCreated(requestId: string, tabId: string): Promise<void>;
  // Tells the main process that the find bar of this guest is open or
  // closed. While it is open, the main process catches Esc on the page.
  setFindOpen(guestId: number, open: boolean): Promise<void>;
  onProfilesChanged(listener: (profiles: Profile[]) => void): () => void;
  onOpenTab(listener: (request: OpenTabRequest) => void): () => void;
  onCreateAgentTab(listener: (request: CreateAgentTabRequest) => void): () => void;
  onAgentState(listener: (states: AgentTabState[]) => void): () => void;
  onCertificateError(listener: (event: CertificateErrorEvent) => void): () => void;
  onNotice(listener: (text: string) => void): () => void;
  onShortcut(listener: (event: ShortcutEvent) => void): () => void;
}
