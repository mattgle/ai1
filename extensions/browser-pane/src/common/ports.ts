export interface ListeningPort {
  pid: number;
  program: string;
  port: number;
}

export interface PortRow extends ListeningPort {
  cwd?: string;
}

export interface PortGroup {
  name: string;
  path: string;
  rows: PortRow[];
}

export interface PortsGrouping {
  groups: PortGroup[];
  other: PortRow[];
}

// Reads `lsof -nP -iTCP -sTCP:LISTEN -F pcn`: a `p` line starts a process,
// `c` is its program, `n` is one listening address. Other fields are ignored.
// A process that listens on the same port on IPv4 and IPv6 gives one row.
export function parseLsofListen(output: string): ListeningPort[] {
  const rows: ListeningPort[] = [];
  const seen = new Set<string>();
  let pid: number | undefined;
  let program = "";
  for (const line of output.split("\n")) {
    const field = line[0];
    const value = line.slice(1);
    if (field === "p") {
      pid = Number(value);
      program = "";
    } else if (field === "c") {
      program = value;
    } else if (field === "n" && pid !== undefined) {
      const port = Number(value.slice(value.lastIndexOf(":") + 1));
      const key = `${pid}:${port}`;
      if (Number.isInteger(port) && port > 0 && !seen.has(key)) {
        seen.add(key);
        rows.push({ pid, program, port });
      }
    }
  }
  return rows;
}

// Reads `lsof -a -p <pids> -d cwd -Fn`.
export function parseLsofCwd(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
    } else if (line.startsWith("n") && pid !== undefined) {
      cwds.set(pid, line.slice(1));
    }
  }
  return cwds;
}

// A root that is a repository, and the repositories directly under a root
// (the meta-repo layout). The roots keep their given order; the repositories
// under one root are sorted by path.
export function findRepositories(
  roots: string[],
  isRepository: (dir: string) => boolean,
  children: (dir: string) => string[],
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (dir: string): void => {
    if (!seen.has(dir)) {
      seen.add(dir);
      found.push(dir);
    }
  };
  for (const root of roots) {
    if (isRepository(root)) {
      add(root);
    }
    for (const child of children(root).filter(isRepository).sort()) {
      add(child);
    }
  }
  return found;
}

export function groupPorts(
  ports: ListeningPort[],
  cwds: Map<number, string>,
  repositories: string[],
): PortsGrouping {
  const byRepository = new Map<string, PortRow[]>();
  const other: PortRow[] = [];
  for (const port of ports) {
    const cwd = cwds.get(port.pid);
    const row: PortRow = cwd === undefined ? { ...port } : { ...port, cwd };
    const repository = cwd === undefined ? undefined : deepestContaining(repositories, cwd);
    if (repository === undefined) {
      other.push(row);
    } else {
      byRepository.set(repository, [...(byRepository.get(repository) ?? []), row]);
    }
  }
  const byPort = (a: PortRow, b: PortRow): number => a.port - b.port;
  const groups = [...byRepository]
    .map(([path, rows]) => ({ name: path.slice(path.lastIndexOf("/") + 1), path, rows: rows.sort(byPort) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { groups, other: other.sort(byPort) };
}

function deepestContaining(repositories: string[], folder: string): string | undefined {
  return repositories
    .filter((repository) => folder === repository || folder.startsWith(`${repository}/`))
    .sort((a, b) => b.length - a.length)[0];
}
