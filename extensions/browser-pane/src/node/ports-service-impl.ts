import { injectable } from "@theia/core/shared/inversify";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { findRepositories, groupPorts, parseLsofCwd, parseLsofListen } from "../common/ports";
import { PortsScan, PortsService, StopServerResult } from "../common/ports-protocol";

export type CommandRunner = (program: string, args: string[], timeoutMs: number) => Promise<string>;
export type KillFn = (pid: number, signal: NodeJS.Signals) => void;

const TIMEOUT_MS = 4000;

// A command exits with 1 when it finds nothing (`lsof`) or when the given
// pid does not exist (`ps -p`). Neither case is an error here.
export const runLsof: CommandRunner = (program, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(program, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`AI1 cannot find ${program}.`));
      } else if (error && error.killed) {
        reject(new Error(`${program} did not answer in ${timeoutMs / 1000} seconds.`));
      } else if (error && error.code !== 1) {
        reject(new Error(`${program} failed: ${error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });

const killProcess: KillFn = (pid, signal) => {
  process.kill(pid, signal);
};

@injectable()
export class PortsServiceImpl implements PortsService {
  constructor(
    protected readonly run: CommandRunner = runLsof,
    protected readonly kill: KillFn = killProcess,
  ) {}

  async scan(rootPaths: string[]): Promise<PortsScan> {
    try {
      const ports = parseLsofListen(
        await this.run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"], TIMEOUT_MS),
      );
      if (ports.length === 0) {
        return { ok: true, groups: [], other: [] };
      }
      const pids = [...new Set(ports.map((port) => port.pid))].join(",");
      const cwds = parseLsofCwd(await this.run("lsof", ["-a", "-p", pids, "-d", "cwd", "-Fn"], TIMEOUT_MS));
      // `lsof` gives real paths: on macOS, `/var/folders/...` is
      // `/private/var/folders/...`. The roots must be real paths too.
      const repositories = findRepositories(
        rootPaths.map(realPath),
        (dir) => fs.existsSync(path.join(dir, ".git")),
        (dir) => childFolders(dir),
      );
      return { ok: true, ...groupPorts(ports, cwds, repositories) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopServer(rootPaths: string[], pid: number, port: number): Promise<StopServerResult> {
    if (!Number.isInteger(pid) || pid <= 0) {
      return { ok: false, error: "AI1 will not stop this process: the process id is not valid." };
    }
    try {
      const scan = await this.scan(rootPaths);
      if (!scan.ok) {
        return { ok: false, error: scan.error };
      }
      const inWorkspaceGroup = scan.groups
        .flatMap((group) => group.rows)
        .some((row) => row.pid === pid && row.port === port);
      if (!inWorkspaceGroup) {
        const inOther = scan.other.some((row) => row.pid === pid && row.port === port);
        return {
          ok: false,
          error: inOther
            ? "AI1 stops only servers of the workspace."
            : "AI1 will not stop this process: it no longer listens on this port.",
        };
      }
      const uid = process.getuid?.();
      if (uid === undefined) {
        return { ok: false, error: "AI1 cannot check who owns this process." };
      }
      const owner = await this.processOwner(pid);
      if (owner === undefined) {
        return { ok: false, error: "AI1 could not find the owner of this process." };
      }
      if (owner !== uid) {
        return { ok: false, error: "AI1 will not stop this process: it belongs to another user." };
      }
      this.kill(pid, "SIGTERM");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // `ps -o uid= -p <pid>` prints the numeric user id of the process. macOS
  // pads it with leading spaces, so the result is trimmed before it is read.
  protected async processOwner(pid: number): Promise<number | undefined> {
    const output = (await this.run("ps", ["-o", "uid=", "-p", String(pid)], TIMEOUT_MS)).trim();
    return /^\d+$/.test(output) ? Number(output) : undefined;
  }
}

function realPath(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

function childFolders(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}
