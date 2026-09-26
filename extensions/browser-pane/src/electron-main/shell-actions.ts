import { shell } from "@theia/core/electron-shared/electron";
import * as fs from "node:fs";
import { E2E_SHELL_LOG, e2eSetting } from "../common/downloads";

// The part of Electron's `shell` that the Downloads view uses.
export interface SystemShell {
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

// The one place where AI1 opens a downloaded file or shows it in Finder. In
// an e2e run with `AI1_E2E_SHELL_LOG`, it only writes one JSON line to that
// file, so no test opens an app or a Finder window.
export class ShellActions {
  protected readonly log: string | undefined;

  constructor(
    env: Record<string, string | undefined> = process.env,
    protected readonly system: SystemShell = shell,
  ) {
    this.log = e2eSetting(env, E2E_SHELL_LOG);
  }

  // Gives the error text of the system, or an empty text when it worked.
  async openPath(target: string): Promise<string> {
    if (this.log !== undefined) {
      this.write("open", target);
      return "";
    }
    return this.system.openPath(target);
  }

  showItemInFolder(target: string): void {
    if (this.log !== undefined) {
      this.write("show", target);
      return;
    }
    this.system.showItemInFolder(target);
  }

  protected write(action: string, target: string): void {
    fs.appendFileSync(this.log!, `${JSON.stringify({ action, path: target })}\n`);
  }
}
