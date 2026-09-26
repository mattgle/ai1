import { DownloadDone, DownloadEntry } from "./downloads";
import { HistoryEntry } from "./history";
import { Profile } from "./profiles";
import { BrowserShortcut } from "./shortcuts";
import { ViewportChoice } from "./viewport";

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
  getZoom: "ai1-browser:get-zoom",
  setZoom: "ai1-browser:set-zoom",
  setViewport: "ai1-browser:set-viewport",
  listDownloads: "ai1-browser:list-downloads",
  cancelDownload: "ai1-browser:cancel-download",
  openDownload: "ai1-browser:open-download",
  showDownload: "ai1-browser:show-download",
  removeDownload: "ai1-browser:remove-download",
  clearDownloads: "ai1-browser:clear-downloads",
  listHistory: "ai1-browser:list-history",
  clearHistory: "ai1-browser:clear-history",

  profilesChanged: "ai1-browser:profiles-changed",
  openTab: "ai1-browser:open-tab",
  createAgentTab: "ai1-browser:create-agent-tab",
  agentState: "ai1-browser:agent-state",
  certificateError: "ai1-browser:certificate-error",
  notice: "ai1-browser:notice",
  shortcut: "ai1-browser:shortcut",
  zoomChanged: "ai1-browser:zoom-changed",
  downloadsChanged: "ai1-browser:downloads-changed",
  downloadDone: "ai1-browser:download-done",
} as const;

// A new zoom level for all tabs whose `zoomKey` is `key`.
export interface ZoomChangedEvent {
  key: string;
  percent: number;
}

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

export type SetViewportResult = { ok: true } | { ok: false; error: string };

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
  // The saved zoom level in percent of the profile and host of `url`.
  getZoom(profileId: string, url: string): Promise<number>;
  // Saves the zoom level of the profile and host of `url` and sends
  // `zoomChanged` to all windows. It does nothing for a page with no host.
  setZoom(profileId: string, url: string, percent: number): Promise<void>;
  // Sets the viewport size of this guest. The page loads again when its
  // user agent changes.
  setViewport(guestId: number, choice: ViewportChoice): Promise<SetViewportResult>;
  // All download entries, newest first. A completed entry whose file is gone
  // becomes "deleted" first.
  listDownloads(): Promise<DownloadEntry[]>;
  cancelDownload(id: string): Promise<void>;
  // Opens the file of a completed download. Gives the error text of the
  // system, or an empty text when it worked.
  openDownload(id: string): Promise<string>;
  // Shows the file of a completed download in Finder. Gives an error text,
  // or an empty text when it worked.
  showDownload(id: string): Promise<string>;
  // Removes an entry that is not in progress from the list. The file stays.
  removeDownload(id: string): Promise<void>;
  // Removes all entries that are not in progress. The files stay.
  clearDownloads(): Promise<void>;
  // The browsing history of the profile, newest first.
  listHistory(profileId: string): Promise<HistoryEntry[]>;
  // Removes all entries of the browsing history of the profile.
  clearHistory(profileId: string): Promise<void>;
  onProfilesChanged(listener: (profiles: Profile[]) => void): () => void;
  onOpenTab(listener: (request: OpenTabRequest) => void): () => void;
  onCreateAgentTab(listener: (request: CreateAgentTabRequest) => void): () => void;
  onAgentState(listener: (states: AgentTabState[]) => void): () => void;
  onCertificateError(listener: (event: CertificateErrorEvent) => void): () => void;
  onNotice(listener: (text: string) => void): () => void;
  onShortcut(listener: (event: ShortcutEvent) => void): () => void;
  onZoomChanged(listener: (event: ZoomChangedEvent) => void): () => void;
  onDownloadsChanged(listener: (entries: DownloadEntry[]) => void): () => void;
  onDownloadDone(listener: (done: DownloadDone) => void): () => void;
}
