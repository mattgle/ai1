import { injectable } from "@theia/core/shared/inversify";
import { TerminalWidgetOptions } from "@theia/terminal/lib/browser/base/terminal-widget";
import { TerminalWidgetImpl } from "@theia/terminal/lib/browser/terminal-widget-impl";

export const SHELL_TERMINAL_KIND = "ai1-tmux";

export interface PersistentTerminalOptions extends TerminalWidgetOptions {
  ai1TmuxName: string;
  ai1AgentSessionId?: string;
}

@injectable()
export class PersistentTerminalWidget extends TerminalWidgetImpl {
  protected override customKeyHandler(event: KeyboardEvent): boolean {
    if (
      event.key === "Enter" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      !this.term.options.disableStdin &&
      !this.isAttachedCloseListener
    ) {
      event.preventDefault();
      if (event.type === "keydown") this.sendText("\n");
      return false;
    }
    return super.customKeyHandler(event);
  }

  get agentSessionId(): string | undefined {
    return (this.options as Partial<PersistentTerminalOptions>).ai1AgentSessionId;
  }

  unlinkAgentSession(): void {
    delete (this.options as Partial<PersistentTerminalOptions>).ai1AgentSessionId;
  }
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
    return { tmuxName: this.tmuxName, titleLabel: this.title.label, agentSessionId: this.agentSessionId };
  }

  override restoreState(oldState: object): void {
    if (!this.tmuxName) {
      super.restoreState(oldState);
      return;
    }
    const state = oldState as { tmuxName?: unknown; titleLabel?: unknown; agentSessionId?: unknown };
    if (state.tmuxName !== this.tmuxName) {
      this.dispose();
      return;
    }
    if (!this.restored) {
      if (typeof state.agentSessionId === "string" && /^[A-Za-z0-9._:-]+$/.test(state.agentSessionId)) {
        (this.options as Partial<PersistentTerminalOptions>).ai1AgentSessionId = state.agentSessionId;
      }
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
