import { ReactWidget } from "@theia/core/lib/browser";
import { CommandService, isOSX } from "@theia/core/lib/common";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { Message } from "@theia/core/shared/@lumino/messaging";

@injectable()
export class WelcomeWidget extends ReactWidget {
  static readonly ID = "ai1-welcome";

  @inject(CommandService)
  protected readonly commands!: CommandService;

  @postConstruct()
  protected init(): void {
    this.id = WelcomeWidget.ID;
    this.title.label = "Welcome to AI1";
    this.title.caption = this.title.label;
    this.title.closable = true;
    this.addClass("ai1-welcome");
    this.node.tabIndex = 0;
    this.update();
  }

  protected render(): React.ReactNode {
    const shortcuts = isOSX
      ? [
          ["Cmd+T", "Open a repository terminal"],
          ["Cmd+D / Cmd+Shift+D", "Split a terminal right / down"],
          ["Cmd+Control+1–9", "Focus a center panel"],
          ["Cmd+1–9", "Focus a tab in the current panel"],
          ["Cmd+Control+0", "Return to the last center panel"],
          ["Cmd+Shift+E", "Focus Explorer"],
          ["Cmd+Control+A / C", "Focus Agents / Changes"],
          ["Cmd+B", "Show or hide Explorer"],
          ["Cmd+Control+Enter", "Zoom or restore the center panel"],
          ["Escape, Escape", "Exit zoom with two quick presses"],
          ["Cmd+Control+B", "Open a browser tab"],
          ["Cmd+Shift+T", "Reopen a closed editor or browser tab"],
          ["Cmd+P / Cmd+Shift+P", "Find a file / command"],
          ["Cmd+F", "Find text in the focused view"],
        ]
      : [
          ["Control+T", "Open a repository terminal"],
          ["Control+D / Control+Shift+D", "Split a terminal right / down"],
          ["Control+Alt+1–9", "Focus a center panel"],
          ["Control+1–9", "Focus a tab in the current panel"],
          ["Control+Shift+E", "Focus Explorer"],
          ["Control+Shift+A / C", "Focus Agents / Changes"],
          ["Control+B", "Show or hide Explorer"],
          ["Control+Alt+Enter", "Zoom or restore the center panel"],
          ["Escape, Escape", "Exit zoom with two quick presses"],
          ["Control+Shift+T", "Reopen a closed editor or browser tab"],
          ["Control+P / Control+Shift+P", "Find a file / command"],
        ];
    return (
      <main>
        <h1>Welcome to AI1</h1>
        <p>Use terminals, agents, files, diffs, and browser tabs in one workspace.</p>
        <h2>Try a small change</h2>
        <ol>
          <li>
            Open your workspace folder. Open a terminal with {isOSX ? "Cmd+T" : "Control+T"}. Select a folder.
            Type a path such as railgun/ to list subfolders. Use Browse for another folder. No Git repository
            is required.
          </li>
          <li>
            Start your agent in the terminal. Or select an OpenCode session in Agents and press Enter. A new
            session terminal opens in the last focused center panel.
          </li>
          <li>
            Split the terminal to keep a second shell beside your agent. Panels have separate tab lists.
          </li>
          <li>
            Open Changes. Click a file row to inspect its diff. Use Open File to inspect the working file. Use
            the Changes settings gear to set search depth or automatic and manual refresh. Save each setting
            for the app profile or this workspace.
          </li>
          <li>
            Control-click the row or Open File button to open that view in center zoom. Explorer, Agents, and
            Changes stay visible.
          </li>
          <li>
            Press Escape twice quickly to restore the splits. On macOS, use Cmd+Control+0 to return from a
            side view to your last center panel.
          </li>
        </ol>
        <h2>Keyboard shortcuts</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(([keys, action]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Panel numbers follow screen position: left to right, then top to bottom. Tab numbers apply only to
          the current panel. A missing number does nothing.
        </p>
        <p>
          A single Escape stays with the focused control or terminal program. Two Escape presses within half a
          second exit zoom.
        </p>
        <p>
          Terminal attention uses a thin blue border for working, amber for input, green for completion, and
          red for supported failures. Claude Code and Codex hooks are opt-in. AI1 does not change global agent
          settings.
        </p>
        <p>
          Agents sessions start in persistent shells. When OpenCode exits, the shell stays open in the same
          directory. Selecting the session again focuses that shell without restarting OpenCode.
        </p>
        {!isOSX && (
          <p>
            Native Linux shortcut behavior still needs verification. Use commands from the command palette if
            a shortcut is unavailable.
          </p>
        )}
        <h2>Start here</h2>
        <button onClick={() => void this.commands.executeCommand("ai1.terminal.newPersistent")}>
          Open a terminal
        </button>
        <button onClick={() => void this.commands.executeCommand("ai1.agents.focus")}>Open Agents</button>
        <button onClick={() => void this.commands.executeCommand("ai1.changes.focus")}>Open Changes</button>
        <p>
          Reopen this tab from Help → Welcome to AI1. Set <code>ai1.welcome.startup</code> to{" "}
          <code>always</code> to show it on each start, or <code>never</code> to disable automatic opening.
        </p>
      </main>
    );
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message);
    this.node.focus();
  }
}
