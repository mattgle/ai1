import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import { UpdaterService, UpdaterServiceToken } from "../common/updater-protocol";
import { UpdateReport, updateSummary } from "../common/update-record";

export const UpdaterCommands = {
  CHECK: { id: "ai1.updater.check", label: "AI1: Check for Updates" },
  UPDATE_TOOLS: { id: "ai1.updater.updateTools", label: "AI1: Update OpenCode and tmux" },
} satisfies Record<string, Command>;

@injectable()
export class UpdaterContribution implements CommandContribution, FrontendApplicationContribution {
  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(UpdaterServiceToken)
  protected readonly service!: UpdaterService;
  protected removeScheduledListener?: () => void;
  protected lastShownReportAt = 0;

  onStart(_app: FrontendApplication): void {
    this.removeScheduledListener = this.service.onScheduledReport(
      (report) => void this.showReport(report, false),
    );
    void this.service.takePendingReport().then((report) => {
      if (report) {
        return this.showReport(report, false);
      }
    });
  }

  onStop(): void {
    this.removeScheduledListener?.();
    this.removeScheduledListener = undefined;
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(UpdaterCommands.CHECK, { execute: () => this.checkAndShow(true) });
    commands.registerCommand(UpdaterCommands.UPDATE_TOOLS, { execute: () => this.updateTools() });
  }

  protected async checkAndShow(manual: boolean): Promise<void> {
    try {
      const report = await this.service.checkForUpdates();
      await this.showReport(report, manual);
    } catch {
      await this.messages.warn("AI1 could not check for updates. Run ‘AI1: Check for Updates’ to try again.");
    }
  }

  protected async showReport(report: UpdateReport, manual: boolean): Promise<void> {
    if (report.checkedAt === this.lastShownReportAt) {
      return;
    }
    this.lastShownReportAt = report.checkedAt;
    const updates = report.records.filter((record) => record.updateAvailable);
    if (!manual && updates.length === 0 && !report.records.some((record) => record.error)) {
      return;
    }
    const canUpdateTools = updates.some((record) => record.canApply && record.source === "homebrew");
    const action = canUpdateTools ? "Update Tools" : undefined;
    const result = action
      ? await this.messages.info(updateSummary(report), action)
      : await this.messages.info(updateSummary(report));
    if (action && result === action) {
      await this.updateTools();
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
