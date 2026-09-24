import { PortsGrouping } from "./ports";

export const PORTS_SERVICE_PATH = "/services/ai1-ports";

export const PortsService = Symbol("PortsService");

export type PortsScan = ({ ok: true } & PortsGrouping) | { ok: false; error: string };

export interface PortsService {
  scan(rootPaths: string[]): Promise<PortsScan>;
}
