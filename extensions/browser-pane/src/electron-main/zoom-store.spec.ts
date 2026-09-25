import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ZoomStore } from "./zoom-store";

describe("ZoomStore", () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-zoom-"));
    file = path.join(folder, "ai1-browser-zoom.json");
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function store(): ZoomStore {
    const created = new ZoomStore(file);
    created.load();
    return created;
  }

  it("gives 100 when there is no entry", () => {
    assert.strictEqual(store().get("default localhost:3000"), 100);
  });

  it("keeps a level in the file", () => {
    store().set("default localhost:3000", 125);
    assert.strictEqual(store().get("default localhost:3000"), 125);
  });

  it("removes the entry for 100", () => {
    const first = store();
    first.set("default localhost:3000", 125);
    first.set("default localhost:3000", 100);
    assert.strictEqual(store().get("default localhost:3000"), 100);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, "utf8")), { levels: {} });
  });

  it("keeps two profiles on the same host separate", () => {
    const first = store();
    first.set("default localhost:3000", 150);
    first.set("agent localhost:3000", 67);
    const second = store();
    assert.strictEqual(second.get("default localhost:3000"), 150);
    assert.strictEqual(second.get("agent localhost:3000"), 67);
    assert.strictEqual(second.get("p-0a1b2c3d localhost:3000"), 100);
  });

  it("refuses a level out of the range", () => {
    assert.throws(() => store().set("default localhost:3000", 1000), /between 25 and 500/);
    assert.throws(() => store().set("default localhost:3000", Number.NaN), /between 25 and 500/);
  });

  it("starts empty when the file is not JSON", () => {
    fs.writeFileSync(file, "not json");
    assert.strictEqual(store().get("default localhost:3000"), 100);
  });

  it("drops entries that are not numbers or are out of the range", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ levels: { "default a:1": "big", "default b:1": 5000, "default c:1": 150 } }),
    );
    const loaded = store();
    assert.strictEqual(loaded.get("default a:1"), 100);
    assert.strictEqual(loaded.get("default b:1"), 100);
    assert.strictEqual(loaded.get("default c:1"), 150);
  });
});
