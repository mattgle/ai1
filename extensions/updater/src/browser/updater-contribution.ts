import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { UpdaterService } from "../common/updater-protocol";
import { isCheckDue, updateSummary } from "../common/update-record";

export const UPDATER_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY = "ai1.updater.lastCheckAt";

export const UpdaterCommands = {
  CHECK: { id: "ai1.updater.check", label: "AI1: Check for Updates" },
  UPDATE_TOOLS: { id: "ai1.updater.updateTools", label: "AI1: Update OpenCode and tmux" },
} satisfies Record<string, Command>;

@injectable()
export class UpdaterContribution implements CommandContribution, FrontendApplicationContribution {
  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(UpdaterService)
  protected readonly service!: UpdaterService;
  protected timer?: ReturnType<typeof setTimeout>;

  onStart(_app: FrontendApplication): void {
    void this.checkOnSchedule();
  }

  onStop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(UpdaterCommands.CHECK, { execute: () => this.checkAndShow(true) });
    commands.registerCommand(UpdaterCommands.UPDATE_TOOLS, { execute: () => this.updateTools() });
  }

  protected async checkOnSchedule(): Promise<void> {
    const lastChecked = Number(window.localStorage.getItem(LAST_CHECK_KEY));
    const savedAt = Number.isFinite(lastChecked) && lastChecked > 0 ? lastChecked : undefined;
    if (isCheckDue(savedAt, Date.now(), UPDATER_CHECK_INTERVAL_MS)) {
      await this.checkAndShow(false);
    }
    const now = Date.now();
    const delay =
      savedAt !== undefined && now - savedAt < UPDATER_CHECK_INTERVAL_MS
        ? Math.max(1, savedAt + UPDATER_CHECK_INTERVAL_MS - now)
        : UPDATER_CHECK_INTERVAL_MS;
    this.timer = setTimeout(() => void this.runScheduledCheck(), delay);
  }

  protected async runScheduledCheck(): Promise<void> {
    await this.checkAndShow(false);
    this.timer = setTimeout(() => void this.runScheduledCheck(), UPDATER_CHECK_INTERVAL_MS);
  }

  protected async checkAndShow(manual: boolean): Promise<void> {
    try {
      const report = await this.service.checkForUpdates();
      window.localStorage.setItem(LAST_CHECK_KEY, String(report.checkedAt));
      const updates = report.records.filter((record) => record.updateAvailable);
      if (!manual && updates.length === 0) {
        return;
      }
      const canUpdateTools = updates.some((record) => record.canApply && record.source === "homebrew");
      const action = canUpdateTools ? "Update Tools" : undefined;
      const result = action
        ? await this.messages.info(updateSummary(report), action)
        : await this.messages.info(updateSummary(report));
      if (result === action) {
        await this.updateTools();
      }
    } catch {
      await this.messages.warn("AI1 could not check for updates. Run ‘AI1: Check for Updates’ to try again.");
    }
  }

  protected async updateTools(): Promise<void> {
    try {
      const result = await this.service.updateTools();
      await this.messages.info(result);
    } catch (error) {
      await this.messages.error(
        error instanceof Error ? error.message : "AI1 could not update OpenCode and tmux.",
      );
    }
  }
}
