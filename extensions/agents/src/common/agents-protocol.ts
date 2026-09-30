import { TmuxSession } from "./tmux-list";

export const AGENTS_SERVICE_PATH = "/services/ai1-agents";

export const AgentsService = Symbol("AgentsService");
export const AgentsClient = Symbol("AgentsClient");

export type SessionStatus = "working" | "blocked" | "done" | "failed" | "idle";

export interface SessionSummary {
  id: string;
  directory: string;
  title: string;
  status: SessionStatus;
  model: string;
  messageCount: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface SessionGroup {
  directory: string;
  name: string;
  sessions: SessionSummary[];
}

export interface AgentsSnapshot {
  groups: SessionGroup[];
  // Resolved paths keep group labels consistent when the workspace uses a symbolic link.
  workspaceRoots: string[];
  connected: boolean;
  // True when the service's own session list, capped globally at 200
  // sessions (see `OpenCodeClient.listSessions`), actually cut off real
  // data -- so some session of this workspace, older than the 200 most
  // recently active across the whole service, may be missing from
  // `groups` and there is no way to tell from here alone.
  truncated: boolean;
}

export interface AgentsClient {
  onSessionChanged(summary: SessionSummary): void;
  onSessionRemoved(id: string): void;
  onConnectionChanged(connected: boolean): void;
  // The back end's own event queue overflowed while a load was in
  // progress (see `AgentsServiceImpl.load`) and was dropped, so nothing
  // was replayed for whatever arrived in that window: the client must ask
  // for a fresh load itself to be current again. Called once every
  // overlapping load on that connection has ended.
  onReloadRequested(): void;
}

export interface AgentsService {
  load(workspaceRootUris: string[]): Promise<AgentsSnapshot>;
  lastMessage(id: string): Promise<string | undefined>;
  createSession(directory: string, title?: string): Promise<SessionSummary>;
  deleteSession(id: string): Promise<void>;
  sendPrompt(id: string, text: string, files?: { uri: string; name?: string }[]): Promise<void>;
  // The command line of the interface process for a session terminal.
  sessionCommand(id: string, directory: string): Promise<{ program: string; args: string[] }>;
  // The command line of a new persistent shell. `directory` is omitted when
  // reattaching to an existing session with no particular directory in mind.
  tmuxCommand(name: string, directory?: string): Promise<{ program: string; args: string[] }>;
  // The AI1 tmux sessions that exist, with their directory when known.
  tmuxSessions(): Promise<TmuxSession[]>;
}
// The RPC transport sets the client of the back-end service. The interface has
// no setClient method; the implementation class has one.
