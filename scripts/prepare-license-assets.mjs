import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = (file) => fs.lstatSync(file, { throwIfNoEntry: false }) !== undefined;

export async function prepareLicenseAssets(configFile, request = globalThis.fetch) {
  const directory = fs.realpathSync(path.dirname(configFile));
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  if (config.schemaVersion !== 1 || !config.sources) throw new Error("Invalid license asset configuration.");
  const prepared = [];
  for (const [id, source] of Object.entries(config.sources)) {
    if (source.download !== true) continue;
    const url = new URL(source.url);
    if (
      url.origin !== "https://raw.githubusercontent.com" ||
      !/^[a-f0-9]{40}$/.test(source.revision) ||
      !url.pathname.includes(`/${source.revision}/`) ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      typeof source.text !== "string" ||
      path.isAbsolute(source.text)
    )
      throw new Error(`Invalid pinned license asset: ${id}`);
    const file = path.resolve(directory, source.text);
    if (!file.startsWith(directory + path.sep))
      throw new Error("License asset escapes the resource directory.");
    let ancestor = path.dirname(file);
    while (!exists(ancestor)) ancestor = path.dirname(ancestor);
    const real = fs.realpathSync(ancestor);
    if (real !== directory && !real.startsWith(directory + path.sep))
      throw new Error("License asset parent escapes the resource directory.");
    if (exists(file)) {
      if (
        fs.lstatSync(file).isSymbolicLink() ||
        !fs.statSync(file).isFile() ||
        digest(fs.readFileSync(file)) !== source.sha256
      )
        throw new Error(`Existing license asset does not match its reviewed bytes: ${id}`);
      prepared.push({ id, downloaded: false });
      continue;
    }
    const response = await request(url.href, {
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`License asset request fails: ${id} (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1024 * 1024 || digest(bytes) !== source.sha256)
      throw new Error(`License asset hash or size mismatch: ${id}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx" });
      fs.linkSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    prepared.push({ id, downloaded: true });
  }
  return prepared;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../applications/electron/resources/third-party/supplements.json",
  );
  const prepared = await prepareLicenseAssets(config);
  console.log(
    `License assets: ${prepared.length} verified; ${prepared.filter((entry) => entry.downloaded).length} downloaded.`,
  );
}
