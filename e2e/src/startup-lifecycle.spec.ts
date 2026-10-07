import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { _electron as electron, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";
import {
  assertStartupExit,
  createStartupOutputObserver,
  type StartupLifecycleRecord,
} from "./startup-lifecycle-diagnostics";

for (const mode of ["shared", "forked"] as const) {
  test(`normal quit closes the ${mode} backend mode without a native crash`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-lifecycle-")));
    const workspace = path.join(root, "workspace");
    const application =
      process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
    const server = new FakeOpenCodeServer();
    let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
    const records: StartupLifecycleRecord[] = [];
    for (const directory of [
      workspace,
      path.join(root, "home"),
      path.join(root, "config"),
      path.join(root, "state/opencode"),
    ])
      fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(root, "config/settings.json"),
      JSON.stringify({ "ai1.welcome.startup": "never" }),
    );
    for (const relative of ["", "child", "nested/project"]) {
      const directory = path.join(workspace, relative);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "file.ts"), "export const value = 1;\n");
      const git = (...args: string[]): void => {
        execFileSync(
          "git",
          [
            "-C",
            directory,
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.name=AI1 Test",
            "-c",
            "user.email=test@ai1.invalid",
            ...args,
          ],
          { stdio: "pipe" },
        );
      };
      git("init", "--quiet", "--initial-branch=main");
      git("add", "file.ts");
      git("commit", "--quiet", "-m", "Add fixture");
    }
    await server.start();
    fs.writeFileSync(
      path.join(root, "state/opencode/service.json"),
      JSON.stringify({ url: server.baseUrl, password: server.password }),
    );
    try {
      // Reuse the profile so each launch tests the normal restart path.
      for (let launch = 1; launch <= 5; launch++) {
        const started = performance.now();
        const record: StartupLifecycleRecord = {
          launch,
          phase: "launch",
          stdoutBytes: 0,
          stderrBytes: 0,
          errorMarkers: [],
          stackSymbols: [],
        };
        records.push(record);
        running = await electron.launch({
          executablePath: process.env.AI1_E2E_EXECUTABLE,
          args: [
            ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
            "--no-sandbox",
            ...(mode === "shared" ? ["--no-cluster"] : []),
            `--app-project-path=${application}`,
            `--user-data-dir=${root}/userdata`,
            `--electronUserData=${root}/userdata`,
            workspace,
          ],
          env: {
            ...process.env,
            HOME: path.join(root, "home"),
            THEIA_CONFIG_DIR: path.join(root, "config"),
            XDG_STATE_HOME: path.join(root, "state"),
            TMUX_TMPDIR: root,
            TMUX: "",
          },
        });
        record.phase = "connected";
        const child = running.process();
        const observe = createStartupOutputObserver(record);
        child.stdout?.on("data", (chunk: Buffer) => observe("stdout", chunk));
        child.stderr?.on("data", (chunk: Buffer) => observe("stderr", chunk));
        child.on("exit", (code, signal) => {
          record.exitCode = code;
          record.signal = signal;
        });
        record.phase = "first-window";
        const page = await running.firstWindow();
        record.windowMs = Math.round(performance.now() - started);
        record.phase = "shell";
        const app = new TheiaApp(page, new TheiaWorkspace(), true);
        await app.waitForShellAndInitialized();
        record.phase = "ready";
        // Pending watcher events can expose native shutdown races.
        for (let index = 0; index < 80; index++)
          fs.writeFileSync(path.join(workspace, `file-${index}.ts`), `export const value = ${launch};\n`);
        const closed = running.waitForEvent("close");
        record.phase = "quit";
        await running.evaluate(({ app }) => app.quit());
        await closed;
        record.phase = "closed";
        running = undefined;
        assertStartupExit(record, mode);
      }
    } finally {
      const report = test.info().outputPath("startup-lifecycle.json");
      fs.writeFileSync(report, JSON.stringify({ mode, records }, null, 2));
      await test
        .info()
        .attach("Startup lifecycle records", { path: report, contentType: "application/json" });
      await running?.close();
      await server.stop();
      await removeTempDir(root);
    }
  });
}
