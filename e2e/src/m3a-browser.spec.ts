import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { TheiaApp, TheiaAppLoader, TheiaWorkspace } from "@theia/playwright";
import { createMetaRepoFixture } from "./meta-repo-fixture";
import { removeTempDir } from "./remove-temp-dir";

const electronAppPath = path.resolve(__dirname, "..", "..", "applications", "electron");
const pluginsPath = path.join(electronAppPath, "plugins");

let app: TheiaApp;
let configDir: string;
let userDataDir: string;

test.beforeAll(async ({ playwright, browser }) => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-config-"));
  process.env.THEIA_CONFIG_DIR = configDir;
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-e2e-m3a-userdata-"));
  const workspace = new TheiaWorkspace();
  workspace.initialize();
  createMetaRepoFixture(workspace.path);
  app = await TheiaAppLoader.load(
    {
      playwright,
      browser,
      useElectron: {
        launchOptions: {
          additionalArgs: [
            "--no-sandbox",
            "--no-cluster",
            `--user-data-dir=${userDataDir}`,
            `--electronUserData=${userDataDir}`,
          ],
          electronAppPath,
          pluginsPath,
        },
      },
    },
    workspace,
  );
});

test.afterAll(async () => {
  try {
    await app.page.close();
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
    await removeTempDir(userDataDir);
  }
});

test("the preload API lists the Default and Agent profiles", async () => {
  const profiles = await app.page.evaluate(() =>
    (
      window as unknown as { electronAi1Browser: { listProfiles(): Promise<unknown> } }
    ).electronAi1Browser.listProfiles(),
  );
  expect(profiles).toEqual([
    { id: "default", name: "Default" },
    { id: "agent", name: "Agent" },
  ]);
});
