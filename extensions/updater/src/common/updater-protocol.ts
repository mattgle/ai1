import { UpdateReport } from "./update-record";

export const AI1_UPDATER_API = "electronAi1Updater";
export const UpdaterServiceToken = Symbol("UpdaterService");
export const UPDATER_CHANNELS = {
  check: "ai1-updater:check",
  updateTools: "ai1-updater:update-tools",
  pendingReport: "ai1-updater:pending-report",
  report: "ai1-updater:report",
} as const;

export interface UpdaterService {
  checkForUpdates(): Promise<UpdateReport>;
  updateTools(): Promise<string>;
  takePendingReport(): Promise<UpdateReport | undefined>;
  onScheduledReport(listener: (report: UpdateReport) => void): () => void;
}

export type UpdaterWindowApi = UpdaterService;
