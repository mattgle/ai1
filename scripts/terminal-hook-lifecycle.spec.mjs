import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";

const repository = fileURLToPath(new URL("../", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

test("isolated hook commands apply fixture lifecycles through a real tmux pane", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai1-hook-lifecycle-"));
  const socket = path.join(root, "tmux.sock");
  const directory = path.join(root, "attention records");
  const helper = path.join(root, "hook helper's command.cjs");
  const environment = { PATH: process.env.PATH, HOME: root, TERM: "xterm-256color" };
  const tmux = (...args) => {
    const result = spawnSync("tmux", ["-S", socket, "-f", "/dev/null", ...args], {
      env: environment,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  try {
    // Prepare only the helper and configuration sources in the test directory.
    for (const [source, output] of [
      ["node/terminal-attention-hook.ts", helper],
      ["common/terminal-hook-config.ts", path.join(root, "config.cjs")],
    ]) {
      const result = await build({
        absWorkingDir: repository,
        entryPoints: [`extensions/agents/src/${source}`],
        bundle: true,
        platform: "node",
        format: "cjs",
        write: false,
      });
      await fs.writeFile(output, result.outputFiles[0].contents, { mode: 0o600 });
    }
    const { terminalHookConfig } = createRequire(import.meta.url)(path.join(root, "config.cjs"));
    // Start a waiting process in the separate tmux server without a login shell.
    const pane = tmux("new-session", "-d", "-s", "ai1-731", "-P", "-F", "#{pane_id}", "/bin/sleep 300");
    const env = { ...environment, TMUX: `${socket},0,0`, TMUX_PANE: pane };
    const recordPath = path.join(directory, "ai1-731.json");
    const read = async () => JSON.parse(await fs.readFile(recordPath, "utf8"));
    const invoke = (agent, input, overrides = {}) => {
      const command = `${quote(process.execPath)} ${quote(helper)} ${agent} ${quote(directory)}`;
      const config = terminalHookConfig(agent, command);
      const event = typeof input === "string" ? undefined : input.hook_event_name;
      const configured = config.hooks[event]?.[0].hooks[0].command;
      // Run the generated hook command with fixture JSON on stdin, not an agent CLI.
      const result = spawnSync("/bin/sh", ["-c", configured ?? command], {
        input: typeof input === "string" ? input : JSON.stringify(input),
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, "{}\n");
    };
    const send = async (agent, event, status, fields = {}) => {
      invoke(agent, { session_id: `${agent}-fixture-session`, hook_event_name: event, ...fields });
      const record = await read();
      assert.equal(record.status, status, `${agent} ${event}`);
      assert.equal(record.pane, pane);
      return record;
    };

    for (const agent of ["claude", "codex"]) {
      await t.test(`${agent} fixture keeps permissions until a turn boundary`, async () => {
        await send(agent, "SessionStart", "idle");
        await send(agent, "UserPromptSubmit", "working", { prompt: "private prompt fixture" });
        await send(agent, "PermissionRequest", "blocked", { tool_name: "Bash" });
        const blocked = await send(agent, "PermissionRequest", "blocked", { tool_name: "Bash" });
        assert.deepEqual(Object.values(blocked.pending), [2]);
        await send(agent, "PreToolUse", "blocked", { tool_name: "Read", tool_use_id: "unrelated" });
        await send(agent, "PostToolUse", "blocked", { tool_name: "Read", tool_use_id: "unrelated" });
        assert.deepEqual((await send(agent, "Stop", "done")).pending, {});
        await send(agent, "UserPromptSubmit", "working");
        await send(agent, "PreToolUse", "blocked", {
          tool_name: agent === "claude" ? "AskUserQuestion" : "request_user_input",
          tool_use_id: "question-fixture",
        });
        assert.deepEqual(
          (await send(agent, "PostToolUse", "working", { tool_use_id: "question-fixture" })).pending,
          {},
        );
        await send(agent, "SessionEnd", "idle");
      });
    }

    await t.test("Claude fixture clears elicitation and records the supported failure", async () => {
      await send("claude", "UserPromptSubmit", "working");
      await send("claude", "Elicitation", "blocked");
      await send("claude", "ElicitationResult", "working");
      assert.deepEqual((await send("claude", "StopFailure", "failed")).pending, {});
      await send("claude", "SessionEnd", "idle");
    });

    await t.test("Gemini fixture keeps permission input until the agent boundary", async () => {
      await send("gemini", "SessionStart", "idle");
      await send("gemini", "BeforeAgent", "working");
      await send("gemini", "Notification", "blocked", { notification_type: "ToolPermission" });
      const blocked = await read();
      invoke("gemini", {
        session_id: "gemini-fixture-session",
        hook_event_name: "AfterTool",
        tool_name: "run_shell_command",
        tool_response: { error: "failed command fixture" },
      });
      assert.deepEqual(await read(), blocked);
      assert.deepEqual((await send("gemini", "AfterAgent", "done")).pending, {});
      await send("gemini", "SessionEnd", "idle");
    });

    await t.test("unsupported failures and child callbacks do not change the record", async () => {
      for (const agent of ["claude", "codex", "gemini"]) {
        await send(agent, "SessionStart", "idle");
        const before = await read();
        for (const event of ["Unknown", ...(agent === "claude" ? [] : ["StopFailure"])]) {
          invoke(agent, { session_id: `${agent}-fixture-session`, hook_event_name: event });
          assert.deepEqual(await read(), before);
        }
        invoke(agent, {
          session_id: `${agent}-fixture-session`,
          hook_event_name: agent === "gemini" ? "AfterAgent" : "Stop",
          agent_id: "child-fixture",
        });
        assert.deepEqual(await read(), before);
      }
    });

    await t.test(
      "invalid stdin and terminal identity leave state and agent decisions unchanged",
      async () => {
        const before = await read();
        for (const input of ["not JSON", "[]", "null", "x".repeat(1024 * 1024 + 1)]) {
          invoke("claude", input);
          assert.deepEqual(await read(), before);
        }
        invoke("claude", { hook_event_name: "Stop" });
        invoke("claude", { session_id: "fixture", hook_event_name: "Stop" }, { TMUX_PANE: "invalid" });
        const otherPane = tmux(
          "new-session",
          "-d",
          "-s",
          "external",
          "-P",
          "-F",
          "#{pane_id}",
          "/bin/sleep 300",
        );
        invoke("claude", { session_id: "fixture", hook_event_name: "Stop" }, { TMUX_PANE: otherPane });
        assert.deepEqual(await read(), before);
        assert.deepEqual(await fs.readdir(directory), ["ai1-731.json"]);
      },
    );

    await t.test("records contain no fixture content and have private permissions", async () => {
      const text = await fs.readFile(recordPath, "utf8");
      for (const content of [
        "fixture-session",
        "private prompt",
        "question-fixture",
        "Bash",
        "tool_response",
      ])
        assert.equal(text.includes(content), false);
      assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(recordPath)).mode & 0o777, 0o600);
    });

    await t.test("an unsafe state directory does not change the hook reply or record", async () => {
      const before = await read();
      await fs.chmod(directory, 0o755);
      try {
        invoke("claude", { session_id: "fixture", hook_event_name: "StopFailure" });
        assert.deepEqual(await read(), before);
      } finally {
        await fs.chmod(directory, 0o700);
      }
    });

    await t.test("a different session or pane resets old permission requests", async () => {
      await send("claude", "PermissionRequest", "blocked");
      invoke("claude", {
        session_id: "different-session-fixture",
        hook_event_name: "PostToolUse",
        tool_use_id: "different-tool-fixture",
      });
      assert.equal((await read()).status, "working");
      assert.deepEqual((await read()).pending, {});
      await send("claude", "PermissionRequest", "blocked");
      const nextPane = tmux("new-window", "-d", "-t", "ai1-731", "-P", "-F", "#{pane_id}", "/bin/sleep 300");
      assert.notEqual(nextPane, pane);
      invoke(
        "claude",
        {
          session_id: "claude-fixture-session",
          hook_event_name: "PostToolUse",
          tool_use_id: "different-tool-fixture",
        },
        { TMUX_PANE: nextPane },
      );
      const record = await read();
      assert.equal(record.pane, nextPane);
      assert.equal(record.status, "working");
      assert.deepEqual(record.pending, {});
    });
  } finally {
    // Remove only the server and directory that this test creates.
    spawnSync("tmux", ["-S", socket, "kill-server"], { env: environment, timeout: 5000 });
    await fs.rm(root, { recursive: true, force: true });
  }
});
