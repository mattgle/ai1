import { contextBridge, ipcRenderer } from "@theia/core/electron-shared/electron";
import { AI1_UPDATER_API, UPDATER_CHANNELS, UpdaterWindowApi } from "../common/updater-protocol";

function listen<T>(listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T): void => listener(value);
  ipcRenderer.on(UPDATER_CHANNELS.report, handler);
  return () => ipcRenderer.removeListener(UPDATER_CHANNELS.report, handler);
}

const api: UpdaterWindowApi = {
  checkForUpdates: () => ipcRenderer.invoke(UPDATER_CHANNELS.check),
  updateTools: () => ipcRenderer.invoke(UPDATER_CHANNELS.updateTools),
  takePendingReport: () => ipcRenderer.invoke(UPDATER_CHANNELS.pendingReport),
  onScheduledReport: listen,
};

contextBridge.exposeInMainWorld(AI1_UPDATER_API, api);
