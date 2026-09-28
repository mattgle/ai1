import { UpdateReport } from "./update-record";

export const UPDATER_SERVICE_PATH = "/services/ai1-updater";
export const UpdaterService = Symbol("UpdaterService");
export const UpdaterClient = Symbol("UpdaterClient");

export interface UpdaterService {
  checkForUpdates(): Promise<UpdateReport>;
  updateTools(): Promise<string>;
}

export type UpdaterClient = Record<string, never>;
