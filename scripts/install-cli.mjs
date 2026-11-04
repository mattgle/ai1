import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { appExecutable, defaultApp } from "./ai1.mjs";

const launcher = fileURLToPath(new URL("./ai1.mjs", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function installCli({ app = defaultApp, bin = path.join(os.homedir(), ".local/bin") } = {}) {
  app = fs.realpathSync(app);
  appExecutable(app);
  const destination = path.resolve(bin, "ai1");
  const script = `#!/bin/sh\n# AI1 terminal launcher. Reinstall if the app, checkout, or Node path moves.\nexport AI1_APP=${quote(app)}\nexec ${quote(process.execPath)} ${quote(launcher)} "$@"\n`;
  const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (existing) {
    if (existing.isFile() && fs.readFileSync(destination, "utf8") === script) {
      fs.accessSync(destination, fs.constants.X_OK);
      return destination;
    }
    throw new Error(
      `The command already exists: ${destination}. Choose another --bin directory or remove it first.`,
    );
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, script, { flag: "wx", mode: 0o755 });
  return destination;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
      console.log(
        "Usage: node scripts/install-cli.mjs [--app path/to/AI1.app] [--bin directory]\nDefaults: the local macOS build and ~/.local/bin. No shell profile is changed.",
      );
    } else {
      if (process.platform !== "darwin") throw new Error("This installer supports macOS only.");
      const options = {};
      while (args.length) {
        const key = args.shift();
        if (!["--app", "--bin"].includes(key) || !args.length || args[0].startsWith("--")) {
          throw new Error("Use --app <AI1.app> and/or --bin <directory>. See --help.");
        }
        options[key.slice(2)] = args.shift();
      }
      const destination = installCli(options);
      console.log(`Installed ${destination}`);
      if (
        !(process.env.PATH ?? "")
          .split(path.delimiter)
          .some((entry) => entry && path.resolve(entry) === path.dirname(destination))
      ) {
        console.log(
          `Add its directory to PATH in your shell configuration:\nexport PATH=${quote(path.dirname(destination))}:"$PATH"`,
        );
      }
      console.log("Use ai1 . or ai1 src/app from an external terminal.");
    }
  } catch (error) {
    console.error(`ai1 install: ${error.message}`);
    process.exitCode = 1;
  }
}
