export const AI1_TMUX_PREFIX = "ai1-";

export interface TmuxSession {
  name: string;
  // The tmux session's working directory (`#{session_path}`), when known.
  directory?: string;
}

// Reads the names of the AI1 sessions from the output of `tmux ls`.
export function parseTmuxList(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => line.indexOf(":") >= 0)
    .map((line) => line.slice(0, line.indexOf(":")))
    .filter((name) => name.startsWith(AI1_TMUX_PREFIX));
}

// Reads the AI1 sessions, with their directory, from the output of
// `tmux ls -F '#{session_name}:#{session_path}'`. A directory can itself
// hold no colon-sensitive parsing beyond the first one: everything after the
// first colon is the path, verbatim.
export function parseTmuxSessions(output: string): TmuxSession[] {
  return output
    .split("\n")
    .filter((line) => line.indexOf(":") >= 0)
    .map((line) => {
      const i = line.indexOf(":");
      const name = line.slice(0, i);
      const directory = line.slice(i + 1).trim();
      return { name, directory: directory || undefined };
    })
    .filter((session) => session.name.startsWith(AI1_TMUX_PREFIX));
}

export function nextTmuxName(existing: string[]): string {
  let n = 1;
  while (existing.includes(`${AI1_TMUX_PREFIX}${n}`)) {
    n += 1;
  }
  return `${AI1_TMUX_PREFIX}${n}`;
}
