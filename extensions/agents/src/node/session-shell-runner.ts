import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const SESSION_LINK_OPTION = "@ai1_agent_session";

export async function runSessionInShell(
  tmux: string,
  name: string,
  id: string,
  program: string,
  args: string[],
): Promise<number> {
  if (!/^ai1-\d+$/.test(name) || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error("Invalid session link.");
  await exec(tmux, ["set-option", "-t", name, SESSION_LINK_OPTION, id], { timeout: 1500 });
  const ignoreInterrupt = (): void => undefined;
  process.on("SIGINT", ignoreInterrupt);
  try {
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(program, args, { stdio: "inherit" });
      const terminate = (): void => {
        child.kill("SIGTERM");
      };
      process.on("SIGTERM", terminate);
      const remove = (): void => {
        process.removeListener("SIGTERM", terminate);
      };
      child.once("error", (error) => {
        remove();
        reject(error);
      });
      child.once("exit", (code, signal) => {
        remove();
        resolve(code ?? (signal === "SIGINT" ? 130 : 1));
      });
    });
  } finally {
    await exec(tmux, ["set-option", "-q", "-u", "-t", name, SESSION_LINK_OPTION], { timeout: 1500 }).catch(
      () => undefined,
    );
    process.removeListener("SIGINT", ignoreInterrupt);
  }
}

if (require.main === module) {
  const [tmux, name, id, program, ...args] = process.argv.slice(2);
  runSessionInShell(tmux, name, id, program, args)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`Could not start the agent: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
