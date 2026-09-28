import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { UpdateCheckStateStore } from "./update-check-state";

describe("UpdateCheckStateStore", () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-update-state-"));
    filePath = path.join(directory, "nested", "update-check.json");
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reads empty state before the first check", () => {
    assert.deepStrictEqual(new UpdateCheckStateStore(filePath).read(), {});
  });

  it("persists the completed check time across store instances", () => {
    new UpdateCheckStateStore(filePath).write({ lastCompletedCheckAt: 1234 });
    assert.deepStrictEqual(new UpdateCheckStateStore(filePath).read(), { lastCompletedCheckAt: 1234 });
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  });

  it("treats invalid persisted data as empty state", () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ lastCompletedCheckAt: "yesterday" }));
    assert.deepStrictEqual(new UpdateCheckStateStore(filePath).read(), {});
  });
});
