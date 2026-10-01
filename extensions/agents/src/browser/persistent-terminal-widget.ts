import { injectable } from "@theia/core/shared/inversify";
import { TerminalWidgetOptions } from "@theia/terminal/lib/browser/base/terminal-widget";
import { TerminalWidgetImpl } from "@theia/terminal/lib/browser/terminal-widget-impl";

export const SHELL_TERMINAL_KIND = "ai1-tmux";

export interface PersistentTerminalOptions extends TerminalWidgetOptions {
  ai1TmuxName: string;
}

@injectable()
export class PersistentTerminalWidget extends TerminalWidgetImpl {
  get tmuxName(): string | undefined {
    const name = (this.options as Partial<PersistentTerminalOptions>).ai1TmuxName;
    return this.kind === SHELL_TERMINAL_KIND && typeof name === "string" && /^ai1-\d+$/.test(name)
      ? name
      : undefined;
  }

  override storeState(): object {
    if (!this.tmuxName) {
      return super.storeState();
    }
    // Save the tmux identity, not a back-end process id from this app run.
    return { tmuxName: this.tmuxName, titleLabel: this.title.label };
  }

  override restoreState(oldState: object): void {
    if (!this.tmuxName) {
      super.restoreState(oldState);
      return;
    }
    const state = oldState as { tmuxName?: unknown; titleLabel?: unknown };
    if (state.tmuxName !== this.tmuxName) {
      this.dispose();
      return;
    }
    if (!this.restored) {
      this.restored = true;
      if (typeof state.titleLabel === "string") {
        this.title.label = state.titleLabel;
      }
      void this.start().catch((error) => {
        this.logger.warn(`Could not restore persistent terminal: ${String(error)}`);
        this.dispose();
      });
    }
  }
}
