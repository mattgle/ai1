import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from "@theia/core/electron-shared/electron";
import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { injectable } from "@theia/core/shared/inversify";
import * as path from "node:path";
import { UpdateReport } from "../common/update-record";
import { UPDATER_CHANNELS } from "../common/updater-protocol";
import { UpdaterServiceImpl } from "../node/updater-service";
import { UpdateCheckScheduler } from "../node/update-check-scheduler";
import { UpdateCheckStateStore } from "../node/update-check-state";

const UPDATE_STORE_NAME = "ai1-update-check.json";

function isTrustedWindow(event: IpcMainInvokeEvent): boolean {
  try {
    const frame = event.senderFrame;
    return (
      event.sender.getType() === "window" &&
      frame !== null &&
      frame.parent === null &&
      new URL(frame.url).protocol === "file:"
    );
  } catch {
    return false;
  }
}

@injectable()
export class UpdaterMainContribution implements ElectronMainApplicationContribution {
  protected readonly service = new UpdaterServiceImpl();
  protected readonly stateStore = new UpdateCheckStateStore(
    path.join(app.getPath("userData"), UPDATE_STORE_NAME),
  );
  protected pendingReport: UpdateReport | undefined;
  protected readonly scheduler = new UpdateCheckScheduler({
    store: this.stateStore,
    check: () => this.service.checkForUpdates(),
    notify: (report) => this.publish(report),
  });

  onStart(_application: ElectronMainApplication): void {
    ipcMain.handle(UPDATER_CHANNELS.check, (event) => this.handle(event, () => this.checkForUpdates()));
    ipcMain.handle(UPDATER_CHANNELS.updateTools, (event) => this.handle(event, () => this.updateTools()));
    ipcMain.handle(UPDATER_CHANNELS.pendingReport, (event) =>
      this.handle(event, async () => {
        const report = this.pendingReport;
        this.pendingReport = undefined;
        return report;
      }),
    );
    this.scheduler.start();
  }

  onStop(): void {
    this.scheduler.stop();
    for (const channel of Object.values(UPDATER_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  }

  async checkForUpdates(): Promise<UpdateReport> {
    return this.scheduler.checkNow();
  }

  updateTools(): Promise<string> {
    return this.service.updateTools();
  }

  async takePendingReport(): Promise<UpdateReport | undefined> {
    const report = this.pendingReport;
    this.pendingReport = undefined;
    return report;
  }

  protected handle<T>(event: IpcMainInvokeEvent, action: () => T | Promise<T>): T | Promise<T> {
    if (!isTrustedWindow(event)) {
      throw new Error("AI1 refused this update request.");
    }
    return action();
  }

  protected publish(report: UpdateReport): void {
    this.pendingReport = report;
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    const target = windows.find((window) => window.isFocused()) ?? windows[0];
    if (target) {
      target.webContents.send(UPDATER_CHANNELS.report, report);
    }
  }
}
