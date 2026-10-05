import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { ChangesServiceImpl } = require("../extensions/changes-view/lib/node/changes-service-impl.js");

class MeasuredChangesService extends ChangesServiceImpl {
  discoveries = 0;
  statusCalls = 0;

  async findRepos(...args) {
    this.discoveries++;
    return super.findRepos(...args);
  }

  async scanRepo(...args) {
    this.statusCalls++;
    return super.scanRepo(...args);
  }
}

const folder = process.argv[2];
const depth = process.argv[3] === undefined ? -1 : Number(process.argv[3]);
if (!folder || !Number.isInteger(depth) || depth < -1) {
  console.error("Usage: node scripts/benchmark-changes.mjs <workspace-folder> [depth]");
  process.exitCode = 1;
} else {
  const service = new MeasuredChangesService();
  const roots = [pathToFileURL(resolve(folder)).toString()];
  const measure = async (kind, changedUris) => {
    service.discoveries = 0;
    service.statusCalls = 0;
    const start = performance.now();
    const repos = await service.scan(roots, depth, changedUris);
    return {
      kind,
      milliseconds: Math.round((performance.now() - start) * 100) / 100,
      discoveryCalls: service.discoveries,
      gitStatusCalls: service.statusCalls,
      changedRepositories: repos.length,
      changedFiles: repos.reduce((sum, repo) => sum + repo.files.length, 0),
    };
  };
  const full = await measure("full");
  const state = await service.cachedScan.state;
  const candidate = state.candidates[0];
  const updates = [];
  if (candidate) {
    const event = pathToFileURL(join(candidate.path, ".git/index")).toString();
    for (let iteration = 0; iteration < 3; iteration++)
      updates.push(await measure("affected-repository", [event]));
  }
  console.log(
    JSON.stringify({ depth, discoveredRepositories: state.candidates.length, full, updates }, null, 2),
  );
}
