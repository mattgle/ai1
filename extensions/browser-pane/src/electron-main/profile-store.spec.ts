import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { INITIAL_PROFILES } from "../common/profiles";
import { ProfileStore } from "./profile-store";

describe("ProfileStore", () => {
  let folder: string;
  let file: string;
  let cleared: string[];

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-profiles-"));
    file = path.join(folder, "profiles.json");
    cleared = [];
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function store(random = (): string => "0a1b2c3d"): ProfileStore {
    const created = new ProfileStore(
      file,
      async (partition) => {
        cleared.push(partition);
      },
      random,
    );
    created.load();
    return created;
  }

  it("starts with Default and Agent when there is no file", () => {
    assert.deepStrictEqual(store().list(), INITIAL_PROFILES);
  });

  it("adds, renames, and keeps profiles in the file", () => {
    const first = store();
    const work = first.add("Work");
    assert.deepStrictEqual(work, { id: "p-0a1b2c3d", name: "Work" });
    first.rename(work.id, "Job");
    assert.deepStrictEqual(store().list(), [...INITIAL_PROFILES, { id: "p-0a1b2c3d", name: "Job" }]);
  });

  it("refuses a duplicate name", () => {
    assert.throws(() => store().add("agent"), /exists/);
  });

  it("deletes a profile and clears the storage of its partition", async () => {
    const first = store();
    const work = first.add("Work");
    await first.delete(work.id);
    assert.deepStrictEqual(store().list(), INITIAL_PROFILES);
    assert.deepStrictEqual(cleared, ["persist:ai1-browser-p-0a1b2c3d"]);
  });

  it("does not delete Default or Agent", async () => {
    const first = store();
    await assert.rejects(first.delete("default"), /cannot be deleted/);
    await assert.rejects(first.delete("agent"), /cannot be deleted/);
  });

  it("adds Default and Agent back to a file that lost them, and drops bad entries", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        profiles: [{ id: "p-11111111", name: "Work" }, { id: "../x", name: "Bad" }, { name: "No id" }],
      }),
    );
    assert.deepStrictEqual(store().list(), [...INITIAL_PROFILES, { id: "p-11111111", name: "Work" }]);
  });

  it("starts again from Default and Agent when the file is not JSON", () => {
    fs.writeFileSync(file, "not json");
    assert.deepStrictEqual(store().list(), INITIAL_PROFILES);
  });
});
