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
  connected: boolean;
}

export interface AgentsClient {
  onSessionChanged(summary: SessionSummary): void;
  onSessionRemoved(id: string): void;
  onConnectionChanged(connected: boolean): void;
}

export interface AgentsService {
  load(workspaceRootUris: string[]): Promise<AgentsSnapshot>;
  lastMessage(id: string): Promise<string | undefined>;
  createSession(directory: string, title?: string): Promise<SessionSummary>;
  deleteSession(id: string): Promise<void>;
  // The command line of the interface process for a session terminal.
  sessionCommand(id: string, directory: string): Promise<{ program: string; args: string[] }>;
  // The command line of a new persistent shell. `directory` is omitted when
  // reattaching to an existing session with no particular directory in mind.
  tmuxCommand(name: string, directory?: string): Promise<{ program: string; args: string[] }>;
  // The AI1 tmux sessions that exist, with their directory when known.
  tmuxSessions(): Promise<TmuxSession[]>;
}
// The RPC transport sets the client of the back-end service. The interface has
// no setClient method; the implementation class of Task 3 has one.
