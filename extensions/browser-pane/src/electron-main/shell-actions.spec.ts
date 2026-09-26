import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ShellActions, SystemShell } from "./shell-actions";

class FakeShell implements SystemShell {
  readonly calls: string[] = [];

  async openPath(target: string): Promise<string> {
    this.calls.push(`open ${target}`);
    return "";
  }

  showItemInFolder(target: string): void {
    this.calls.push(`show ${target}`);
  }
}

describe("ShellActions", () => {
  let folder: string;
  let log: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-shell-actions-"));
    log = path.join(folder, "shell.log");
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function lines(): unknown[] {
    return fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  }

  it("writes to the log and does not call the shell in an e2e run", async () => {
    const shell = new FakeShell();
    const actions = new ShellActions({ AI1_E2E_BACKGROUND: "1", AI1_E2E_SHELL_LOG: log }, shell);
    actions.showItemInFolder("/downloads/a.txt");
    assert.strictEqual(await actions.openPath("/downloads/b.txt"), "");
    assert.deepStrictEqual(shell.calls, []);
    assert.deepStrictEqual(lines(), [
      { action: "show", path: "/downloads/a.txt" },
      { action: "open", path: "/downloads/b.txt" },
    ]);
  });

  it("calls the shell in a normal start, also when the log variable is set", async () => {
    const shell = new FakeShell();
    const actions = new ShellActions({ AI1_E2E_SHELL_LOG: log }, shell);
    actions.showItemInFolder("/downloads/a.txt");
    await actions.openPath("/downloads/b.txt");
    assert.deepStrictEqual(shell.calls, ["show /downloads/a.txt", "open /downloads/b.txt"]);
    assert.strictEqual(fs.existsSync(log), false);
  });
});
