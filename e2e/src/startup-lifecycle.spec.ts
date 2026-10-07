import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";

for (const mode of ["shared", "forked"] as const) {
  test(`normal quit closes the ${mode} backend mode without a native crash`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-lifecycle-")));
    const workspace = path.join(root, "workspace");
    const application =
      process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
    const server = new FakeOpenCodeServer();
    let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
    const records: {
      launch: number;
      windowMs?: number;
      exitCode?: number | null;
      signal?: string | null;
      errorMarkers: string[];
      stackSymbols: string[];
    }[] = [];
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
        const record: (typeof records)[number] = { launch, errorMarkers: [], stackSymbols: [] };
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
        const child = running.process();
        let stderrTail = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-8192);
          for (const marker of [
            "napi_fatal_error",
            "FATAL ERROR",
            "Cannot create a handle without a HandleScope",
            "Channel closed",
            "ERR_IPC_CHANNEL_CLOSED",
            "UnhandledPromiseRejection",
            "EADDRINUSE",
            "TypeError",
            "ReferenceError",
          ])
            if (stderrTail.includes(marker) && !record.errorMarkers.includes(marker))
              record.errorMarkers.push(marker);
          for (const match of stderrTail.matchAll(/^\s+at ([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gm))
            if (!record.stackSymbols.includes(match[1]) && record.stackSymbols.length < 30)
              record.stackSymbols.push(match[1]);
        });
        child.on("exit", (code, signal) => {
          record.exitCode = code;
          record.signal = signal;
        });
        const page = await running.firstWindow();
        record.windowMs = Math.round(performance.now() - started);
        const app = new TheiaApp(page, new TheiaWorkspace(), true);
        await app.waitForShellAndInitialized();
        // Pending watcher events can expose native shutdown races.
        for (let index = 0; index < 80; index++)
          fs.writeFileSync(path.join(workspace, `file-${index}.ts`), `export const value = ${launch};\n`);
        const closed = running.waitForEvent("close");
        await running.evaluate(({ app }) => app.quit());
        await closed;
        running = undefined;
        expect(record.signal).toBeNull();
        // The shared backend uses Theia's documented shutdown exit code 1.
        expect(mode === "shared" ? [0, 1] : [0]).toContain(record.exitCode);
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
