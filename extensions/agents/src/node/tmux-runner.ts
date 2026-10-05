import { execFile } from "node:child_process";
import { parseTmuxSessions, TmuxSession } from "../common/tmux-list";

// Lists the AI1 tmux sessions, with their working directory. No server
// gives an empty list. `-F` asks tmux for exactly the two fields this needs,
// one session per line, with no extra text to parse around.
export function listTmuxSessions(): Promise<TmuxSession[]> {
  return new Promise((resolve) => {
    execFile(
      "tmux",
      ["ls", "-F", "#{session_name}:#{session_path}"],
      { encoding: "utf8" },
      (_error, stdout, stderr) => {
        resolve(parseTmuxSessions(`${stdout}${stderr}`));
      },
    );
  });
}

// The args of `tmux new`, attaching to `name` if it exists. `-c <dir>` is
// included only when a directory is given, so reattaching to an existing
// session (for example on reopen) does not force it back to a directory the
// session may have since `cd`'d away from.
export function tmuxNewCommand(name: string, directory?: string): { program: string; args: string[] } {
  const args = ["new", "-A", "-s", name];
  if (directory) {
    args.push("-c", directory);
  }
  return { program: "tmux", args };
}

export function listSessionShellLinks(names: string[]): Promise<{ name: string; id?: string }[]> {
  const requested = [...new Set(names.filter((name) => /^ai1-\d+$/.test(name)))].slice(0, 100);
  if (!requested.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    execFile(
      "tmux",
      ["ls", "-F", "#{session_name}\t#{@ai1_agent_session}"],
      { encoding: "utf8", timeout: 1500 },
      (error, stdout, stderr) => {
        if (error && !/no server running|failed to connect|no sessions/.test(stderr)) {
          reject(error);
          return;
        }
        const links = new Map(
          stdout
            .trim()
            .split("\n")
            .map((line) => line.split("\t"))
            .filter((parts) => parts.length === 2)
            .map(([name, id]) => [name, id]),
        );
        resolve(requested.map((name) => ({ name, id: links.get(name) || undefined })));
      },
    );
  });
}
