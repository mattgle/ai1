import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CommandResult, UpdaterServiceImpl } from "./updater-service";

describe("UpdaterServiceImpl", () => {
  it("checks Linux extension pins but does not run unverified tool commands", async () => {
    let commands = 0;
    const service = new UpdaterServiceImpl({
      cwd: root,
      platform: "linux",
      runCommand: async () => {
        commands += 1;
        throw new Error("No tool command is permitted in this test.");
      },
      fetchJson: async () => ({ version: "1.96.0" }),
    });
    const report = await service.checkForUpdates();
    assert.equal(commands, 0);
    assert.deepStrictEqual(
      report.records.slice(0, 2).map((record) => ({
        source: record.source,
        canApply: record.canApply,
        current: record.current,
        available: record.available,
      })),
      [
        { source: "manual", canApply: false, current: undefined, available: undefined },
        { source: "manual", canApply: false, current: undefined, available: undefined },
      ],
    );
    assert.ok(report.records[0].error?.includes("not available"));
    assert.equal(report.records[2].updateAvailable, true);
    assert.equal(report.records[2].canApply, false);
    assert.ok(report.records[3].error?.includes("not verified"));
  });

  it("does not report Linux sources as current when source data is missing or invalid", async () => {
    for (const response of [{}, { version: "invalid" }, null]) {
      const service = new UpdaterServiceImpl({
        cwd: root,
        platform: "linux",
        fetchJson: async () => response,
      });
      const report = await service.checkForUpdates();
      assert.equal(report.records[2].updateAvailable, false);
      assert.ok(report.records[2].error);
    }
    const service = new UpdaterServiceImpl({
      cwd: path.join(root, "outside", "..", ".."),
      platform: "linux",
    });
    const report = await service.checkForUpdates();
    assert.ok(report.records[2].error?.includes("source checkout"));
  });
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-updater-"));
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "ai1",
        theiaPlugins: {
          "vscode.typescript":
            "https://open-vsx.org/api/vscode/typescript/1.95.3/file/vscode.typescript-1.95.3.vsix",
        },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function result(stdout: string): CommandResult {
    return { stdout, stderr: "" };
  }

  it("checks Homebrew, Open VSX, and origin/main without applying updates", async () => {
    const calls: { program: string; args: string[] }[] = [];
    const runner = async (program: string, args: string[]): Promise<CommandResult> => {
      calls.push({ program, args });
      if (program === "brew") {
        return result(
          JSON.stringify({
            formulae: [
              { name: "opencode-v2", versions: { stable: "2.1.0" } },
              { name: "tmux", versions: { stable: "3.6" } },
            ],
          }),
        );
      }
      if (program === "opencode") {
        return result("opencode 2.0.12\n");
      }
      if (program === "tmux") {
        return result("tmux 3.5a\n");
      }
      if (program === "git" && args[0] === "fetch") {
        return result("");
      }
      if (program === "git" && args[0] === "rev-list") {
        return result("0\t1\n");
      }
      if (program === "git" && args[0] === "rev-parse" && args[1] === "--short") {
        return result(args[2] === "origin/main" ? "def5678\n" : "abc1234\n");
      }
      throw new Error(`Unexpected command ${program}`);
    };
    const urls: string[] = [];
    const service = new UpdaterServiceImpl({
      cwd: root,
      platform: "darwin",
      now: () => 1234,
      runCommand: runner,
      fetchJson: async (url) => {
        urls.push(url);
        return { version: "1.96.0" };
      },
    });

    const report = await service.checkForUpdates();

    assert.equal(report.checkedAt, 1234);
    assert.deepStrictEqual(
      report.records.map(({ id, current, available, updateAvailable, canApply }) => ({
        id,
        current,
        available,
        updateAvailable,
        canApply,
      })),
      [
        {
          id: "anomalyco/tap/opencode-v2",
          current: "2.0.12",
          available: "2.1.0",
          updateAvailable: true,
          canApply: true,
        },
        {
          id: "tmux",
          current: "3.5a",
          available: "3.6",
          updateAvailable: true,
          canApply: true,
        },
        {
          id: "vscode.typescript",
          current: "1.95.3",
          available: "1.96.0",
          updateAvailable: true,
          canApply: false,
        },
        {
          id: "ai1",
          current: "abc1234",
          available: "def5678",
          updateAvailable: true,
          canApply: false,
        },
      ],
    );
    assert.deepStrictEqual(urls, ["https://open-vsx.org/api/vscode/typescript"]);
    assert.equal(
      calls.some(({ program, args }) => program === "git" && args[0] === "fetch"),
      true,
    );
    assert.equal(
      calls.some(({ program, args }) => program === "git" && args[0] === "merge"),
      false,
    );
    assert.equal(
      calls.some(({ program, args }) => program === "brew" && args[0] === "upgrade"),
      false,
    );
  });

  it("keeps other source results when the Open VSX request fails", async () => {
    const service = new UpdaterServiceImpl({
      cwd: root,
      platform: "darwin",
      runCommand: async (program, args) => {
        if (program === "brew") {
          return result(JSON.stringify({ formulae: [] }));
        }
        if (program === "opencode") {
          return result("opencode 2.0.12");
        }
        if (program === "tmux") {
          return result("tmux 3.5a");
        }
        if (program === "git" && args[0] === "fetch") {
          return result("");
        }
        if (program === "git" && args[0] === "rev-list") {
          return result("0\t0\n");
        }
        if (program === "git" && args[0] === "rev-parse" && args[1] === "--short") {
          return result("abc1234");
        }
        if (program === "git" && args[0] === "rev-parse") {
          return result("abc1234");
        }
        throw new Error("unexpected program");
      },
      fetchJson: async () => {
        throw new Error("private response details");
      },
    });

    const report = await service.checkForUpdates();

    assert.equal(report.records.length, 4);
    assert.equal(report.records[0].error, "AI1 could not read the installed or stable Homebrew version.");
    assert.equal(report.records[2].error, "the update check failed.");
    assert.equal(report.records[3].updateAvailable, false);
  });

  it("runs Homebrew upgrade only for the supported formulas", async () => {
    const calls: { program: string; args: string[] }[] = [];
    const service = new UpdaterServiceImpl({
      platform: "darwin",
      runCommand: async (program, args) => {
        calls.push({ program, args });
        if (args[0] === "outdated") {
          return result(JSON.stringify({ formulae: [{ name: "opencode-v2" }, { name: "tmux" }] }));
        }
        return result("updated");
      },
    });

    assert.equal(
      await service.updateTools(),
      "Homebrew installed the updates. Running OpenCode and tmux processes keep their current versions until they restart.",
    );
    assert.deepStrictEqual(calls, [
      { program: "brew", args: ["update"] },
      { program: "brew", args: ["outdated", "--json=v2", "--formula"] },
      { program: "brew", args: ["upgrade", "anomalyco/tap/opencode-v2", "tmux"] },
    ]);
  });

  it("does not run an upgrade when the supported formulas are current", async () => {
    const calls: string[][] = [];
    const service = new UpdaterServiceImpl({
      platform: "darwin",
      runCommand: async (_program, args) => {
        calls.push(args);
        return args[0] === "outdated" ? result(JSON.stringify({ formulae: [{ name: "git" }] })) : result("");
      },
    });

    assert.equal(await service.updateTools(), "OpenCode and tmux are up to date.");
    assert.deepStrictEqual(calls, [["update"], ["outdated", "--json=v2", "--formula"]]);
  });

  it("does not run Homebrew updates outside macOS", async () => {
    let ran = false;
    const service = new UpdaterServiceImpl({
      platform: "linux",
      runCommand: async () => {
        ran = true;
        return result("");
      },
    });

    await assert.rejects(service.updateTools(), /macOS only/);
    assert.equal(ran, false);
  });

  it("does not check sources or apply updates when checks are disabled", async () => {
    let ran = false;
    const service = new UpdaterServiceImpl({
      enabled: false,
      now: () => 42,
      runCommand: async () => {
        ran = true;
        return result("");
      },
      fetchJson: async () => {
        ran = true;
        return {};
      },
    });

    assert.deepStrictEqual(await service.checkForUpdates(), { checkedAt: 42, records: [] });
    await assert.rejects(service.updateTools(), /disabled for this run/);
    assert.equal(ran, false);
  });
});
