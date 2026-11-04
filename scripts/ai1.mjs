#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

export const defaultApp = fileURLToPath(
  new URL("../applications/electron/dist/mac-arm64/AI1.app", import.meta.url),
);

export function appExecutable(app) {
  const executable = path.join(fs.realpathSync(app), "Contents/MacOS/AI1");
  if (!fs.statSync(executable).isFile()) throw new Error(`Not an AI1 executable: ${executable}`);
  fs.accessSync(executable, fs.constants.X_OK);
  return executable;
}

export function workspaceDirectory(args, cwd = process.cwd()) {
  if (args[0] === "--") args = args.slice(1);
  else if (args[0]?.startsWith("-")) throw new Error(`Unknown option: ${args[0]}. Use ai1 --help.`);
  if (args.length > 1) throw new Error("Use ai1 [directory]. Open one directory at a time.");
  const directory = path.resolve(cwd, args[0] ?? ".");
  let resolved;
  try {
    resolved = fs.realpathSync(directory);
  } catch {
    throw new Error(`Directory does not exist or is not accessible: ${directory}`);
  }
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Not a directory: ${directory}`);
  return resolved;
}

export async function launchWorkspace(
  args,
  { app = defaultApp, cwd = process.cwd(), env = process.env } = {},
) {
  const workspace = workspaceDirectory(args, cwd);
  let executable;
  try {
    executable = appExecutable(app);
  } catch (error) {
    throw new Error(`Cannot launch AI1 at ${app}. Build the app or set AI1_APP. ${error.message}`);
  }
  const environment = { ...env };
  // Electron-based terminal hosts can export this flag to child processes.
  delete environment.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [workspace], {
      cwd,
      env: environment,
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Usage: ai1 [directory]\nOpen a directory in AI1. The default is the current directory.\nUse -- before a directory name that starts with a dash.\nAI1_APP selects a macOS AI1.app bundle.",
    );
  } else if (process.platform !== "darwin") {
    console.error("ai1: This launcher supports macOS. Use the Linux package's ai1 command on Linux.");
    process.exitCode = 1;
  } else {
    try {
      await launchWorkspace(args, { app: process.env.AI1_APP || defaultApp });
    } catch (error) {
      console.error(`ai1: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
