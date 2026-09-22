export const AI1_TMUX_PREFIX = "ai1-";

// Reads the names of the AI1 sessions from the output of `tmux ls`.
export function parseTmuxList(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => line.indexOf(":") >= 0)
    .map((line) => line.slice(0, line.indexOf(":")))
    .filter((name) => name.startsWith(AI1_TMUX_PREFIX));
}

export function nextTmuxName(existing: string[]): string {
  let n = 1;
  while (existing.includes(`${AI1_TMUX_PREFIX}${n}`)) {
    n += 1;
  }
  return `${AI1_TMUX_PREFIX}${n}`;
}
