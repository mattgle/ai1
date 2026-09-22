// Copies the manifest and the SVG files of the material-icon-theme package into
// the application package. The packaged app has no node_modules folder, so the
// back end reads the icons from this copy.
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"));
const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(applicationRoot, "resources", "material-icons");

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "dist"), { recursive: true });
await cp(
  path.join(packageRoot, "dist", "material-icons.json"),
  path.join(target, "dist", "material-icons.json"),
);
await cp(path.join(packageRoot, "icons"), path.join(target, "icons"), { recursive: true });
console.log(`Material icons copied to ${target}`);
