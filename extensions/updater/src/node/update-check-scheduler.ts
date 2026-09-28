import { isCheckDue, UpdateReport } from "../common/update-record";
import { UpdateCheckStateStore } from "./update-check-state";

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_RETRY_INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateCheckSchedulerOptions {
  store: UpdateCheckStateStore;
  check: () => Promise<UpdateReport>;
  notify: (report: UpdateReport) => void;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

function hasCheckFailures(report: UpdateReport): boolean {
  return report.records.some((record) => record.error !== undefined);
}

export class UpdateCheckScheduler {
  protected readonly now: () => number;
  protected readonly schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  protected readonly cancel: (timer: ReturnType<typeof setTimeout>) => void;
  protected timer?: ReturnType<typeof setTimeout>;
  protected running: Promise<UpdateReport> | undefined;
  protected started = false;

  constructor(protected readonly options: UpdateCheckSchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancel = options.cancel ?? clearTimeout;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const lastChecked = this.options.store.read().lastCompletedCheckAt;
    if (isCheckDue(lastChecked, this.now(), UPDATE_CHECK_INTERVAL_MS)) {
      void this.runAutomaticCheck();
      return;
    }
    this.scheduleNext(lastChecked! + UPDATE_CHECK_INTERVAL_MS - this.now());
  }

  stop(): void {
    this.started = false;
    if (this.timer !== undefined) {
      this.cancel(this.timer);
      this.timer = undefined;
    }
  }

  checkNow(): Promise<UpdateReport> {
    if (this.running) {
      return this.running;
    }
    const running = this.runCheck(false).then((report) => report);
    this.running = running;
    const clear = (): void => {
      if (this.running === running) {
        this.running = undefined;
      }
    };
    void running.then(clear, clear);
    return running;
  }

  protected runAutomaticCheck(): void {
    if (this.running) {
      this.scheduleNext(UPDATE_CHECK_RETRY_INTERVAL_MS);
      return;
    }
    const running = this.runCheck(true);
    this.running = running;
    const clear = (): void => {
      if (this.running === running) {
        this.running = undefined;
      }
    };
    void running.then(clear, clear);
  }

  protected async runCheck(automatic: boolean): Promise<UpdateReport> {
    let retry = false;
    try {
      const report = await this.options.check();
      retry = hasCheckFailures(report);
      if (!retry) {
        this.options.store.write({ lastCompletedCheckAt: report.checkedAt });
      }
      if (automatic && report.records.some((record) => record.updateAvailable || record.error)) {
        this.options.notify(report);
      }
      return report;
    } catch (error) {
      retry = true;
      if (!automatic) {
        throw error;
      }
      const report: UpdateReport = {
        checkedAt: this.now(),
        records: [
          {
            id: "updater",
            name: "Update check",
            source: "git",
            updateAvailable: false,
            canApply: false,
            error: "AI1 could not complete the update check.",
          },
        ],
      };
      this.options.notify(report);
      return report;
    } finally {
      if (this.started) {
        this.scheduleNext(retry ? UPDATE_CHECK_RETRY_INTERVAL_MS : UPDATE_CHECK_INTERVAL_MS);
      }
    }
  }

  protected scheduleNext(delay: number): void {
    if (this.timer !== undefined) {
      this.cancel(this.timer);
    }
    this.timer = this.schedule(
      () => {
        this.timer = undefined;
        this.runAutomaticCheck();
      },
      Math.max(1, delay),
    );
    this.timer.unref?.();
  }
}
