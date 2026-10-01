import { execFile as nodeExecFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { compareVersions } from "../common/update-record";
import { UpdateRecord, UpdateReport } from "../common/update-record";

const execFile = promisify(nodeExecFile);
const HOME_BREW_FORMULAE = ["anomalyco/tap/opencode-v2", "tmux"] as const;
const HOME_BREW_NAMES = ["OpenCode", "tmux"] as const;
const OPEN_VSX_BASE = "https://open-vsx.org/api";
const COMMAND_TIMEOUT_MS = 30_000;

interface BrewFormula {
  name: string;
  versions?: { stable?: string };
}

interface BrewInfo {
  formulae?: BrewFormula[];
}

interface ExtensionPin {
  id: string;
  publisher: string;
  name: string;
  version: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (program: string, args: string[]) => Promise<CommandResult>;
export type JsonFetcher = (url: string) => Promise<unknown>;

export interface UpdaterServiceOptions {
  cwd?: string;
  platform?: NodeJS.Platform;
  enabled?: boolean;
  runCommand?: CommandRunner;
  fetchJson?: JsonFetcher;
  now?: () => number;
}

function defaultCommandRunner(program: string, args: string[]): Promise<CommandResult> {
  return execFile(program, args, {
    timeout: program === "brew" ? 120_000 : COMMAND_TIMEOUT_MS,
    maxBuffer: 1_000_000,
  }).then((result) => ({ stdout: result.stdout, stderr: result.stderr }));
}

async function defaultJsonFetcher(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`The update service returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return "the required program is not installed or is not on PATH.";
  }
  if (error && typeof error === "object" && "killed" in error && error.killed === true) {
    return "the check timed out.";
  }
  return "the update check failed.";
}

function parseCurrentVersion(output: string): string | undefined {
  return /\bv?(\d+(?:\.\d+)*(?:[-+][0-9a-z.-]+|[a-z]+)?)\b/i.exec(output)?.[1];
}

function homebrewRecords(info: BrewInfo, versions: (string | undefined)[]): UpdateRecord[] {
  return HOME_BREW_FORMULAE.map((formula, index) => {
    const current = versions[index];
    const available = info.formulae?.find(
      (entry) => entry.name === formula || entry.name === formula.split("/").at(-1),
    )?.versions?.stable;
    if (!current || !available) {
      return {
        id: formula,
        name: HOME_BREW_NAMES[index],
        source: "homebrew",
        updateAvailable: false,
        canApply: true,
        error: "AI1 could not read the installed or stable Homebrew version.",
      };
    }
    const comparison = compareVersions(current, available);
    if (comparison === undefined) {
      return {
        id: formula,
        name: HOME_BREW_NAMES[index],
        source: "homebrew",
        current,
        available,
        updateAvailable: false,
        canApply: true,
        error: "AI1 could not compare these version numbers.",
      };
    }
    return {
      id: formula,
      name: HOME_BREW_NAMES[index],
      source: "homebrew",
      current,
      available,
      updateAvailable: comparison < 0,
      canApply: true,
    };
  });
}

function parseExtensionPins(root: string): ExtensionPin[] {
  const packagePath = path.join(root, "package.json");
  const rootPackage = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    theiaPlugins?: Record<string, unknown>;
  };
  return Object.entries(rootPackage.theiaPlugins ?? {}).flatMap(([id, rawUrl]) => {
    if (typeof rawUrl !== "string") {
      return [];
    }
    try {
      const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
      const apiIndex = parts.indexOf("api");
      if (apiIndex < 0 || parts.length < apiIndex + 4) {
        return [];
      }
      const [publisher, name, version] = parts.slice(apiIndex + 1, apiIndex + 4);
      return [{ id, publisher, name, version }];
    } catch {
      return [];
    }
  });
}

function ai1RootFrom(cwd: string, platform: NodeJS.Platform): string | undefined {
  if (platform !== "darwin" && platform !== "linux") {
    return undefined;
  }
  let candidate = path.resolve(cwd);
  for (;;) {
    const packagePath = path.join(candidate, "package.json");
    try {
      const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string };
      if (parsed.name === "ai1" && fs.existsSync(path.join(candidate, ".git"))) {
        return candidate;
      }
    } catch {
      // Keep walking until AI1's source root is found.
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return undefined;
    }
    candidate = parent;
  }
}

export class UpdaterServiceImpl {
  protected readonly cwd: string;
  protected readonly platform: NodeJS.Platform;
  protected readonly enabled: boolean;
  protected readonly runCommand: CommandRunner;
  protected readonly fetchJson: JsonFetcher;
  protected readonly now: () => number;

  constructor(options: UpdaterServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.platform = options.platform ?? process.platform;
    this.enabled = options.enabled ?? process.env.AI1_E2E_BACKGROUND !== "1";
    this.runCommand = options.runCommand ?? defaultCommandRunner;
    this.fetchJson = options.fetchJson ?? defaultJsonFetcher;
    this.now = options.now ?? Date.now;
  }

  async checkForUpdates(): Promise<UpdateReport> {
    if (!this.enabled) {
      return { checkedAt: this.now(), records: [] };
    }
    const records = await Promise.all([this.checkHomebrewTools(), this.checkExtensions(), this.checkAi1()]);
    return { checkedAt: this.now(), records: records.flat() };
  }

  async updateTools(): Promise<string> {
    if (!this.enabled) {
      throw new Error("Updater actions are disabled for this run.");
    }
    if (this.platform !== "darwin") {
      throw new Error("Homebrew updates are supported on macOS only.");
    }
    try {
      await this.runCommand("brew", ["update"]);
      const result = await this.runCommand("brew", ["outdated", "--json=v2", "--formula"]);
      const outdated = JSON.parse(result.stdout) as { formulae?: { name?: string }[] };
      const outdatedNames = new Set((outdated.formulae ?? []).map((formula) => formula.name));
      const formulas = HOME_BREW_FORMULAE.filter(
        (formula) => outdatedNames.has(formula) || outdatedNames.has(formula.split("/").at(-1)),
      );
      if (formulas.length === 0) {
        return "OpenCode and tmux are up to date.";
      }
      await this.runCommand("brew", ["upgrade", ...formulas]);
      return "Homebrew installed the updates. Running OpenCode and tmux processes keep their current versions until they restart.";
    } catch (error) {
      throw new Error(errorMessage(error));
    }
  }

  protected async checkHomebrewTools(): Promise<UpdateRecord[]> {
    if (this.platform === "linux") {
      return HOME_BREW_NAMES.map((name, index) => ({
        id: index === 0 ? "opencode" : "tmux",
        name,
        source: "manual",
        updateAvailable: false,
        canApply: false,
        error:
          "Linux tool update status is not available. Check the installed Linux version and update by hand through the owner-approved source.",
      }));
    }
    if (this.platform !== "darwin") {
      return HOME_BREW_FORMULAE.map((id, index) => ({
        id,
        name: HOME_BREW_NAMES[index],
        source: "homebrew",
        updateAvailable: false,
        canApply: false,
        error: "Homebrew update checks are supported on macOS only.",
      }));
    }
    let info: BrewInfo;
    try {
      const result = await this.runCommand("brew", ["info", "--json=v2", ...HOME_BREW_FORMULAE]);
      info = JSON.parse(result.stdout) as BrewInfo;
    } catch (error) {
      const message = errorMessage(error);
      return HOME_BREW_FORMULAE.map((id, index) => ({
        id,
        name: HOME_BREW_NAMES[index],
        source: "homebrew",
        updateAvailable: false,
        canApply: true,
        error: message,
      }));
    }
    const installed = await Promise.all([
      this.readInstalledVersion("opencode", ["--version"]),
      this.readInstalledVersion("tmux", ["-V"]),
    ]);
    return homebrewRecords(info, installed);
  }

  protected async readInstalledVersion(program: string, args: string[]): Promise<string | undefined> {
    try {
      const result = await this.runCommand(program, args);
      return parseCurrentVersion(result.stdout);
    } catch {
      return undefined;
    }
  }

  protected async checkExtensions(): Promise<UpdateRecord[]> {
    const root = ai1RootFrom(this.cwd, this.platform);
    if (!root) {
      return [
        {
          id: "bundled-extensions",
          name: "Bundled VS Code extensions",
          source: "open-vsx",
          updateAvailable: false,
          canApply: false,
          error: "Open AI1 from its source checkout to check bundled extensions.",
        },
      ];
    }
    let pins: ExtensionPin[];
    try {
      pins = parseExtensionPins(root);
    } catch {
      return [
        {
          id: "bundled-extensions",
          name: "Bundled VS Code extensions",
          source: "open-vsx",
          updateAvailable: false,
          canApply: false,
          error: "AI1 could not read the pinned extension versions.",
        },
      ];
    }
    return Promise.all(
      pins.map(async (pin) => {
        try {
          const response = await this.fetchJson(
            `${OPEN_VSX_BASE}/${encodeURIComponent(pin.publisher)}/${encodeURIComponent(pin.name)}`,
          );
          const available =
            response &&
            typeof response === "object" &&
            "version" in response &&
            typeof response.version === "string"
              ? response.version
              : undefined;
          const comparison = available ? compareVersions(pin.version, available) : undefined;
          if (!available || comparison === undefined) {
            throw new Error("The registry returned no valid version.");
          }
          return {
            id: pin.id,
            name: pin.id,
            source: "open-vsx",
            current: pin.version,
            available,
            updateAvailable: comparison < 0,
            canApply: false,
          };
        } catch (error) {
          return {
            id: pin.id,
            name: pin.id,
            source: "open-vsx",
            current: pin.version,
            updateAvailable: false,
            canApply: false,
            error: errorMessage(error),
          };
        }
      }),
    );
  }

  protected async checkAi1(): Promise<UpdateRecord[]> {
    if (this.platform === "linux") {
      return [
        {
          id: "ai1",
          name: "AI1",
          source: "git",
          updateAvailable: false,
          canApply: false,
          error:
            "Linux Git update checks are not verified. Check the source checkout by hand. AI1 does not build or install an update.",
        },
      ];
    }
    const root = ai1RootFrom(this.cwd, this.platform);
    if (!root) {
      return [
        {
          id: "ai1",
          name: "AI1",
          source: "git",
          updateAvailable: false,
          canApply: false,
          error: "Open AI1 from its source checkout to check for updates.",
        },
      ];
    }
    try {
      await this.runCommand("git", ["fetch", "--quiet", "origin", "main"]);
      const [head, remote, counts] = await Promise.all([
        this.runCommand("git", ["rev-parse", "--short", "HEAD"]),
        this.runCommand("git", ["rev-parse", "--short", "origin/main"]),
        this.runCommand("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"]),
      ]);
      const [aheadRaw, behindRaw] = counts.stdout.trim().split(/\s+/);
      const ahead = Number(aheadRaw);
      const behind = Number(behindRaw);
      const current = head.stdout.trim();
      const available = remote.stdout.trim();
      if (
        !/^[0-9a-f]{7,40}$/i.test(available) ||
        !/^[0-9a-f]{7,40}$/i.test(current) ||
        !Number.isSafeInteger(ahead) ||
        !Number.isSafeInteger(behind)
      ) {
        throw new Error("Git returned no main branch status.");
      }
      if (ahead > 0 && behind > 0) {
        throw new Error("the local branch and origin/main have diverged. Update AI1 by hand.");
      }
      return [
        {
          id: "ai1",
          name: "AI1",
          source: "git",
          current,
          available: available.slice(0, 7),
          updateAvailable: behind > 0,
          canApply: false,
        },
      ];
    } catch (error) {
      return [
        {
          id: "ai1",
          name: "AI1",
          source: "git",
          updateAvailable: false,
          canApply: false,
          error: errorMessage(error),
        },
      ];
    }
  }
}
