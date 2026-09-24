import { injectable } from "@theia/core/shared/inversify";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { findRepositories, groupPorts, parseLsofCwd, parseLsofListen } from "../common/ports";
import { PortsScan, PortsService } from "../common/ports-protocol";

export type CommandRunner = (program: string, args: string[], timeoutMs: number) => Promise<string>;

const TIMEOUT_MS = 4000;

// `lsof` exits with 1 when it finds nothing. That is not an error here.
export const runLsof: CommandRunner = (program, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(program, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("AI1 cannot find lsof."));
      } else if (error && error.killed) {
        reject(new Error(`lsof did not answer in ${timeoutMs / 1000} seconds.`));
      } else if (error && error.code !== 1) {
        reject(new Error(`lsof failed: ${error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });

@injectable()
export class PortsServiceImpl implements PortsService {
  constructor(protected readonly run: CommandRunner = runLsof) {}

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
