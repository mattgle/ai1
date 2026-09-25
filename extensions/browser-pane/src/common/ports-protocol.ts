import { PortsGrouping } from "./ports";

export const PORTS_SERVICE_PATH = "/services/ai1-ports";

export const PortsService = Symbol("PortsService");

export type PortsScan = ({ ok: true } & PortsGrouping) | { ok: false; error: string };

export type StopServerResult = { ok: true } | { ok: false; error: string };

export interface PortsService {
  scan(rootPaths: string[]): Promise<PortsScan>;

  // Stops the process with this pid, but only when a fresh scan shows it
  // still listens on this port, in a workspace group, and owned by the
  // current user.
  stopServer(rootPaths: string[], pid: number, port: number): Promise<StopServerResult>;
}
