import { AbstractDialog, ApplicationShell, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { CommandContribution, CommandRegistry, MessageService, QuickPickService } from "@theia/core";
import { DisposableCollection } from "@theia/core/lib/common/disposable";
import { inject, injectable } from "@theia/core/shared/inversify";
import { TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { TerminalService } from "@theia/terminal/lib/browser/base/terminal-service";
import { attentionCaption, attentionClass, TerminalAttentionState } from "../common/terminal-attention";
import { AgentsModel } from "./agents-model";
import { AgentsTerminals } from "./agents-terminals";
import { AgentsService } from "../common/agents-protocol";
import { PersistentTerminalWidget } from "./persistent-terminal-widget";
import { HookAgent } from "../common/terminal-hook-event";
import { terminalHookConfig } from "../common/terminal-hook-config";

class AttentionSetupDialog extends AbstractDialog<void> {
  constructor(text: string) {
    super({ title: "Terminal attention setup" });
    const area = document.createElement("textarea");
    area.value = text;
    area.readOnly = true;
    area.rows = 20;
    area.style.width = "640px";
    area.style.maxWidth = "100%";
    area.setAttribute("aria-label", "Agent hook setup instructions");
    this.contentNode.appendChild(area);
    this.appendCloseButton("Close");
  }

  get value(): void {
    return undefined;
  }
}

@injectable()
export class TerminalAttentionContribution implements FrontendApplicationContribution, CommandContribution {
  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(QuickPickService)
  protected readonly quickPick!: QuickPickService;

  @inject(MessageService)
  protected readonly messages!: MessageService;
  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(TerminalService)
  protected readonly terminals!: TerminalService;

  @inject(AgentsModel)
  protected readonly model!: AgentsModel;

  @inject(AgentsTerminals)
  protected readonly agentsTerminals!: AgentsTerminals;

  protected readonly states = new WeakMap<TerminalWidget, TerminalAttentionState>();
  protected readonly subscriptions = new DisposableCollection();
  protected timer: ReturnType<typeof setInterval> | undefined;
  protected polling = false;
  protected pollingForms = false;
  protected pollingLinks = false;
  protected stopped = false;
  protected readonly pendingForms = new Set<string>();

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(
      { id: "ai1.terminal.linkOpenCode", label: "Link Terminal to OpenCode Session", category: "Terminal" },
      {
        isEnabled: () =>
          this.shell.currentWidget instanceof PersistentTerminalWidget && !!this.shell.currentWidget.tmuxName,
        execute: async () => {
          const terminal = this.shell.currentWidget;
          if (!(terminal instanceof PersistentTerminalWidget) || !terminal.tmuxName) return;
          const sessions = this.model.groups.flatMap((group) => group.sessions);
          const selected = await this.quickPick.show(
            sessions.map((session) => ({
              label: session.title,
              description: session.directory,
              value: session.id,
            })),
            { placeholder: "Select the OpenCode session running in this terminal" },
          );
          if (selected && !terminal.isDisposed) {
            this.agentsTerminals.linkSession(terminal, selected.value);
            this.refresh();
          }
        },
      },
    );
    commands.registerCommand(
      { id: "ai1.terminal.attentionSetup", label: "Set Up Agent Attention Hooks", category: "Terminal" },
      {
        execute: async () => {
          try {
            const setup = await this.service.terminalAttentionSetup();
            const quote = (text: string): string => `'${text.replace(/'/g, `'"'"'`)}'`;
            const make = (agent: HookAgent): string =>
              JSON.stringify(
                terminalHookConfig(agent, `node ${quote(setup.hookPath)} ${agent} ${quote(setup.directory)}`),
                null,
                2,
              );
            await new AttentionSetupDialog(
              `These hooks only report attention. They do not approve actions.\nUse Node 24 on PATH. Run the agent inside an AI1 persistent terminal.\nMerge the hooks with existing settings. Do not replace your settings file.\n\nClaude Code: ~/.claude/settings.json or project settings\n${make("claude")}\n\nCodex: ~/.codex/hooks.json or project hooks\n${make("codex")}\nReview and trust Codex hooks in /hooks. Do not bypass hook trust.\n\nGemini CLI: ~/.gemini/settings.json or project settings\n${make("gemini")}\nReview project hooks and keep the CLI's trust checks enabled.\nGemini reports working, permission input, and completion. Unsupported failures remain unmarked.\n\nOpenCode: select its terminal, then run Terminal: Link Terminal to OpenCode Session.\nNo agent settings change when you open this dialog.\nNo prompts, answers, or tool output are stored.\nAntigravity integration remains deferred.`,
            ).open();
          } catch {
            await this.messages.error("Agent hook setup is not available. Check the app connection.");
          }
        },
      },
    );
  }

  onStart(): void {
    this.subscriptions.push(this.model.onDidChange(() => this.refresh()));
    this.subscriptions.push(
      this.shell.onDidChangeCurrentWidget(({ newValue }) => {
        if (newValue instanceof TerminalWidget) {
          this.states.get(newValue)?.select();
          this.apply(newValue);
        }
      }),
    );
    this.refresh();
    this.timer = setInterval(() => {
      void this.poll();
      void this.pollForms();
      void this.pollLinks();
    }, 1000);
  }

  onStop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.subscriptions.dispose();
  }

  protected async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    const terminals = this.terminals.all.filter(
      (terminal): terminal is PersistentTerminalWidget =>
        terminal instanceof PersistentTerminalWidget &&
        !!terminal.tmuxName &&
        !terminal.isDisposed &&
        !this.agentsTerminals.sessionIdOf(terminal),
    );
    if (!terminals.length) return;
    this.polling = true;
    try {
      const records = await this.service.terminalAttention(terminals.map((terminal) => terminal.tmuxName!));
      if (this.stopped) return;
      for (const terminal of terminals) {
        if (terminal.isDisposed || this.agentsTerminals.sessionIdOf(terminal)) continue;
        const record = records.find((item) => item.name === terminal.tmuxName);
        if (!record) {
          this.states.get(terminal)?.update("idle", false);
          this.apply(terminal);
          continue;
        }
        let state = this.states.get(terminal);
        if (!state) {
          state = new TerminalAttentionState();
          this.states.set(terminal, state);
        }
        state.update(record.status, this.shell.currentWidget === terminal, record.token);
        this.apply(terminal);
      }
    } catch {
      // Keep the last known state when the app connection is not available.
    } finally {
      this.polling = false;
    }
  }

  protected async pollForms(): Promise<void> {
    if (this.pollingForms || this.stopped || !this.model.connected) return;
    const ids = this.terminals.all
      .filter((terminal) => !terminal.isDisposed)
      .map((terminal) => this.agentsTerminals.sessionIdOf(terminal))
      .filter((id): id is string => !!id);
    if (!ids.length) return;
    this.pollingForms = true;
    try {
      const inputs = await this.service.sessionInputAttention(ids);
      if (this.stopped) return;
      for (const input of inputs) {
        if (input.pending) this.pendingForms.add(input.id);
        else this.pendingForms.delete(input.id);
      }
      this.refresh();
    } catch {
      // Keep the last known question state when OpenCode is not available.
    } finally {
      this.pollingForms = false;
    }
  }

  protected refresh(): void {
    const sessions = new Map(
      this.model.groups.flatMap((group) => group.sessions).map((session) => [session.id, session]),
    );
    for (const terminal of this.terminals.all) {
      const id = this.agentsTerminals.sessionIdOf(terminal);
      if (!id || terminal.isDisposed) continue;
      const session = sessions.get(id);
      let state = this.states.get(terminal);
      if (!state) {
        state = new TerminalAttentionState();
        this.states.set(terminal, state);
      }
      state.update(
        session && this.pendingForms.has(id) ? "blocked" : (session?.status ?? "idle"),
        this.shell.currentWidget === terminal,
      );
      this.apply(terminal);
    }
  }

  protected apply(terminal: TerminalWidget): void {
    const state = this.states.get(terminal);
    if (!state || terminal.isDisposed) return;
    terminal.title.className = attentionClass(terminal.title.className, state.attention);
    terminal.title.caption = attentionCaption(terminal.title.label, state.attention);
  }

  protected async pollLinks(): Promise<void> {
    if (this.pollingLinks || this.stopped) return;
    this.pollingLinks = true;
    try {
      await this.agentsTerminals.refreshSessionShellLinks();
      if (!this.stopped) this.refresh();
    } catch {
      // Keep the last known session link when the app connection is not available.
    } finally {
      this.pollingLinks = false;
    }
  }
}
