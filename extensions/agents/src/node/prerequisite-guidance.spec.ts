import * as assert from "node:assert";
import { notInstalledMessage } from "./opencode-client";

describe("prerequisite guidance", () => {
  it("preserves macOS install commands", () => {
    assert.equal(
      notInstalledMessage("opencode", "darwin"),
      "OpenCode is not installed. Install it with: brew install anomalyco/tap/opencode-v2",
    );
    assert.equal(
      notInstalledMessage("tmux", "darwin"),
      "tmux is not installed. Install it with: brew install tmux",
    );
  });

  it("names Ubuntu packages without an automatic install command", () => {
    for (const [program, packageName] of [
      ["git", "git"],
      ["tmux", "tmux"],
      ["lsof", "lsof"],
      ["ps", "procps"],
    ]) {
      const message = notInstalledMessage(program, "linux");
      assert.ok(message.includes(`the ${packageName} package by hand`));
      assert.ok(!message.includes("brew"));
      assert.ok(!message.includes("sudo"));
    }
  });

  it("requires a reviewed Linux OpenCode v2 source", () => {
    const message = notInstalledMessage("opencode", "linux");
    assert.ok(message.includes("owner-approved Linux v2 install source"));
    assert.ok(!message.includes("brew"));
    assert.ok(!message.includes("apt install opencode"));
  });

  it("does not turn an unknown program into a package command", () => {
    for (const program of ["", "--bad", "tmux; sudo install", "toString", "__proto__"]) {
      assert.equal(
        notInstalledMessage(program, "linux"),
        "The required program is not installed or is not on Linux PATH. Install the Linux tool by hand.",
      );
    }
    assert.ok(notInstalledMessage("tmux", "win32").includes("no approved install instructions"));
  });
});
