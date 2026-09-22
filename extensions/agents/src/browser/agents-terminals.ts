import { inject, injectable } from "@theia/core/shared/inversify";
import { TerminalService } from "@theia/terminal/lib/browser/base/terminal-service";
import { TerminalLocation, TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { AgentsService, SessionSummary } from "../common/agents-protocol";
import { nextTmuxName } from "../common/tmux-list";
import { AgentsModel } from "./agents-model";

export const SESSION_TERMINAL_KIND = "ai1-session";
export const SHELL_TERMINAL_KIND = "ai1-tmux";

// A terminal widget execs its shellPath directly: no login shell, no shell
// profile, and the new process is the pty's own session leader. `opencode`'s
// interface (and, empirically, `tmux` too) exits at once (code 1, no output)
// under that direct exec, but runs correctly as an ordinary child of a shell
// (a plain terminal window, or `script`, both proven to work). `sh -c 'exec
// "$@"' -- program arg...` runs the real program as `sh`'s child, byte-safe
// regardless of spaces or shell metacharacters in an argument (`"$@"` keeps
// each argument a separate word; nothing here is interpolated into the
// command string).
function shellWrap(program: string, args: string[]): { program: string; args: string[] } {
  return { program: "/bin/sh", args: ["-c", 'exec "$@"', "--", program, ...args] };
}

// Opens and tracks the terminal tabs of sessions and of persistent shells.
// A session tab runs the OpenCode interface on an existing session. A closed
// tab loses nothing: the session lives in the service.
@injectable()
export class AgentsTerminals {
  @inject(TerminalService)
  protected readonly terminals!: TerminalService;

  @inject(AgentsService)
  protected readonly service!: AgentsService;

  @inject(AgentsModel)
  protected readonly model!: AgentsModel;

  protected readonly bySession = new Map<string, TerminalWidget>();

  async openSession(session: SessionSummary): Promise<void> {
    const existing = this.bySession.get(session.id);
    if (existing && !existing.isDisposed) {
      await this.terminals.open(existing, { mode: "activate" });
      return;
    }
    const raw = await this.service.sessionCommand(session.id, session.directory);
    const command = shellWrap(raw.program, raw.args);
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
    });
    this.bySession.set(session.id, terminal);
    this.model.openTerminals.add(session.id);
    terminal.onTerminalDidClose(() => this.forget(session.id));
    terminal.onDidDispose(() => this.forget(session.id));
    await terminal.start();
    await this.terminals.open(terminal, { mode: "activate" });
  }

  // Closes the tabs of the sessions that are not working and not blocked.
  closeIdle(): number {
    let closed = 0;
    for (const [id, terminal] of [...this.bySession]) {
      const session = this.model.groups.flatMap((group) => group.sessions).find((s) => s.id === id);
      const busy = session && (session.status === "working" || session.status === "blocked");
      if (!busy) {
        terminal.dispose();
        closed += 1;
      }
    }
    return closed;
  }

  async newPersistent(directory: string): Promise<void> {
    const name = nextTmuxName(await this.service.tmuxSessions());
    await this.openTmux(name, directory);
  }

  // On start, each existing ai1-* tmux session gets its tab again.
  async reopenPersistent(): Promise<void> {
    for (const name of await this.service.tmuxSessions()) {
      await this.openTmux(name, undefined, false);
    }
  }

  protected async openTmux(name: string, directory: string | undefined, activate = true): Promise<void> {
    const raw = await this.service.tmuxCommand(name, directory ?? "");
    const rawArgs = directory
      ? raw.args
      : raw.args.filter((arg, i, all) => arg !== "-c" && all[i - 1] !== "-c");
    const command = shellWrap(raw.program, rawArgs);
    const terminal = await this.terminals.newTerminal({
      title: `sh · ${directory ? directory.slice(directory.lastIndexOf("/") + 1) : name}`,
      useServerTitle: false,
      shellPath: command.program,
      shellArgs: command.args,
      cwd: directory,
      destroyTermOnClose: true,
      kind: SHELL_TERMINAL_KIND,
      location: TerminalLocation.Editor,
    });
    await terminal.start();
    await this.terminals.open(terminal, { mode: activate ? "activate" : "open" });
  }

  protected forget(id: string): void {
    this.bySession.delete(id);
    this.model.openTerminals.delete(id);
  }
}
