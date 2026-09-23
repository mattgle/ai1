import { inject, injectable } from "@theia/core/shared/inversify";
import { IShellTerminalServer } from "@theia/terminal/lib/common/shell-terminal-protocol";
import { TerminalService } from "@theia/terminal/lib/browser/base/terminal-service";
import { TerminalLocation, TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { AgentsService, SessionSummary } from "../common/agents-protocol";
import { IdentityMap } from "../common/identity-map";
import { settleWithin } from "../common/settle-within";
import { nextTmuxName } from "../common/tmux-list";
import { AgentsModel } from "./agents-model";

export const SESSION_TERMINAL_KIND = "ai1-session";
export const SHELL_TERMINAL_KIND = "ai1-tmux";
const CLOSE_LIMIT_MS = 1500;

// Opens and tracks the terminal tabs of sessions and of persistent shells.
// A session tab runs the OpenCode interface on an existing session. A closed
// tab loses nothing: the session lives in the service.
@injectable()
export class AgentsTerminals {
  @inject(TerminalService)
  protected readonly terminals!: TerminalService;

  @inject(IShellTerminalServer)
  protected readonly shellTerminalServer!: IShellTerminalServer;

  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(AgentsModel)
  protected readonly model!: AgentsModel;

  protected readonly bySession = new IdentityMap<string, TerminalWidget>();
  protected readonly byTmux = new IdentityMap<string, TerminalWidget>();

  async openSession(session: SessionSummary): Promise<void> {
    const existing = this.bySession.get(session.id);
    if (existing && !existing.isDisposed) {
      await this.terminals.open(existing, { mode: "activate" });
      return;
    }
    const command = await this.service.sessionCommand(session.id, session.directory);
    const terminal = await this.terminals.newTerminal({
      title: `OC · ${session.title}`,
      useServerTitle: false,
      shellPath: command.program,
      shellArgs: command.args,
      cwd: session.directory,
      destroyTermOnClose: true,
      kind: SESSION_TERMINAL_KIND,
      // Without this, the default terminal creation handler places a new
      // terminal in the bottom panel, not the center, per
      // `TerminalShellHandler.onWillOpenTerminal` in the installed source.
      location: TerminalLocation.Editor,
      // The session lives in the service, not in this tab: Theia must never
      // store or restore it as part of the workbench layout. A restored tab
      // would try to reconnect to a process id from a previous run, which no
      // longer exists.
      isTransient: true,
    });
    this.bySession.set(session.id, terminal);
    this.model.markTerminalOpen(session.id);
    terminal.onTerminalDidClose(() => this.forgetSession(session.id, terminal));
    terminal.onDidDispose(() => this.forgetSession(session.id, terminal));
    await terminal.start();
    await this.terminals.open(terminal, { mode: "activate" });
  }

  // Closes the tabs of the sessions that are not working and not blocked.
  closeIdle(): number {
    let closed = 0;
    const known = new Map(this.model.groups.flatMap((group) => group.sessions).map((s) => [s.id, s]));
    for (const [id, terminal] of this.bySession.entries()) {
      const session = known.get(id);
      // `!session`: the model does not know this id (for example a session
      // it has not loaded yet, or one that left the workspace) -- keep its
      // tab, do not guess it is idle.
      const busy = !session || session.status === "working" || session.status === "blocked";
      if (!busy) {
        terminal.dispose();
        closed += 1;
      }
    }
    return closed;
  }

  // Disposes the tab of a session, if one is open. Called after a delete.
  closeSession(id: string): void {
    const terminal = this.bySession.get(id);
    if (terminal && !terminal.isDisposed) {
      terminal.dispose();
    }
  }

  async newPersistent(directory: string): Promise<void> {
    const existing = await this.service.tmuxSessions();
    const name = nextTmuxName(existing.map((session) => session.name));
    await this.openTmux(name, directory);
  }

  // On start, each existing ai1-* tmux session gets its tab again. One
  // session's failure does not stop the others.
  async reopenPersistent(): Promise<void> {
    for (const session of await this.service.tmuxSessions()) {
      try {
        await this.openTmux(session.name, session.directory, false);
      } catch (error) {
        console.warn(
          `ai1-agents: could not reopen the tmux session '${session.name}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  hasTerminals(): boolean {
    return !this.bySession.values().next().done || !this.byTmux.values().next().done;
  }

  // Closes the back-end process of every tracked tab. The contribution calls
  // it from `onWillStop`, the only stop hook that Theia awaits before a
  // reload or a close (`DefaultWindowService.isSafeToShutDown`). A transient
  // tab does not do it by itself: `TerminalWidgetImpl.storeState` sets
  // `closeOnDispose = false` before its transient check, and Theia disposes
  // the tabs before `onStop` runs. A reload from outside Theia's window
  // service (for example Playwright's `page.reload()`) skips this path.
  //
  // `isSafeToShutDown` has no time limit, and an RPC call to a dead back end
  // waits for a reconnect that never comes, so the wait has a limit here.
  // Closing a tmux client does not kill its tmux session.
  async closeAllBackends(): Promise<void> {
    const all = [...this.bySession.values(), ...this.byTmux.values()];
    await settleWithin(
      Promise.allSettled(all.map((terminal) => this.shellTerminalServer.close(terminal.terminalId))),
      CLOSE_LIMIT_MS,
    );
  }

  protected async openTmux(name: string, directory: string | undefined, activate = true): Promise<void> {
    const command = await this.service.tmuxCommand(name, directory);
    const terminal = await this.terminals.newTerminal({
      title: `sh · ${directory ? directory.slice(directory.lastIndexOf("/") + 1) : name}`,
      useServerTitle: false,
      shellPath: command.program,
      shellArgs: command.args,
      cwd: directory,
      destroyTermOnClose: true,
      kind: SHELL_TERMINAL_KIND,
      location: TerminalLocation.Editor,
      // The shell lives in tmux, not in this tab: see the note on
      // `openSession` above. Reopening asks tmux by name instead.
      isTransient: true,
    });
    this.byTmux.set(name, terminal);
    terminal.onTerminalDidClose(() => this.byTmux.forgetIfSame(name, terminal));
    terminal.onDidDispose(() => this.byTmux.forgetIfSame(name, terminal));
    await terminal.start();
    await this.terminals.open(terminal, { mode: activate ? "activate" : "open" });
  }

  // Only forgets `terminal` if it is still the current tab of `id`: a
  // reopened session's new terminal must not be dropped by the old one's
  // delayed close/dispose event.
  protected forgetSession(id: string, terminal: TerminalWidget): void {
    if (this.bySession.forgetIfSame(id, terminal)) {
      this.model.markTerminalClosed(id);
    }
  }
}
