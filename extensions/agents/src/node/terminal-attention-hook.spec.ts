import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { writeTerminalHook } from "./terminal-attention-hook";
import { readTerminalHookRecord } from "./terminal-hook-store";

describe("terminal hook storage", () => {
  let root: string;
  let directory: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ai1-hook-store-"));
    directory = path.join(root, "attention");
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("stores only status and opaque IDs with private permissions", async () => {
    await writeTerminalHook(directory, "ai1-1", "%1", "claude", {
      hook_event_name: "PermissionRequest",
      session_id: "fixture-session",
      tool_name: "Bash",
      tool_input: { command: "private fixture text" },
    });
    const record = await readTerminalHookRecord(directory, "ai1-1");
    assert.equal(record?.status, "blocked");
    const text = await fs.readFile(path.join(directory, "ai1-1.json"), "utf8");
    assert.equal(text.includes("private fixture text"), false);
    assert.equal(text.includes("fixture-session"), false);
    assert.equal(text.includes("Bash"), false);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(directory, "ai1-1.json"))).mode & 0o777, 0o600);
  });

  it("serializes concurrent requests without losing a pending count", async () => {
    const input = { hook_event_name: "PermissionRequest", session_id: "fixture", tool_name: "Bash" };
    await Promise.all([
      writeTerminalHook(directory, "ai1-1", "%1", "codex", input),
      writeTerminalHook(directory, "ai1-1", "%1", "codex", input),
    ]);
    assert.deepEqual(Object.values((await readTerminalHookRecord(directory, "ai1-1"))!.pending), [2]);
    await writeTerminalHook(directory, "ai1-1", "%1", "codex", { ...input, hook_event_name: "PostToolUse" });
    assert.equal((await readTerminalHookRecord(directory, "ai1-1"))?.status, "blocked");
    await writeTerminalHook(directory, "ai1-1", "%1", "codex", {
      ...input,
      hook_event_name: "UserPromptSubmit",
    });
    assert.equal((await readTerminalHookRecord(directory, "ai1-1"))?.status, "working");
  });

  it("resets old requests when a terminal pane or agent session changes", async () => {
    await writeTerminalHook(directory, "ai1-1", "%1", "claude", {
      hook_event_name: "PermissionRequest",
      session_id: "one",
      tool_name: "Bash",
    });
    await writeTerminalHook(directory, "ai1-1", "%2", "claude", {
      hook_event_name: "PostToolUse",
      tool_use_id: "fixture-call",
      session_id: "two",
      tool_name: "Read",
    });
    assert.equal((await readTerminalHookRecord(directory, "ai1-1"))?.status, "working");
  });

  it("ignores non-AI1 terminals, traversal, unsupported hooks, and symlink records", async () => {
    await writeTerminalHook(directory, "../outside", "%1", "claude", {
      hook_event_name: "Stop",
      session_id: "one",
    });
    await writeTerminalHook(directory, "ai1-1", "%1", "claude", {
      hook_event_name: "Unknown",
      session_id: "one",
    });
    await assert.rejects(fs.stat(directory), { code: "ENOENT" });
    await fs.mkdir(directory, { mode: 0o700 });
    const outside = path.join(root, "private.json");
    await fs.writeFile(outside, "{}", { mode: 0o600 });
    await fs.symlink(outside, path.join(directory, "ai1-1.json"));
    assert.equal(await readTerminalHookRecord(directory, "ai1-1"), undefined);
  });
});
