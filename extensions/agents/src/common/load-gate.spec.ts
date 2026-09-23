import * as assert from "node:assert";
import { LoadGate } from "./load-gate";

describe("LoadGate", () => {
  it("lets the first load start", () => {
    const gate = new LoadGate();
    assert.strictEqual(gate.start(), true);
  });

  it("blocks a second start while the first load is in flight, and records it as dirty", () => {
    const gate = new LoadGate();
    gate.start();
    assert.strictEqual(gate.start(), false);
  });

  it("does not ask for another load when nothing happened while a load was in flight", () => {
    const gate = new LoadGate();
    gate.start();
    assert.strictEqual(gate.end(), false);
  });

  it("asks for another load when a start was blocked while a load was in flight", () => {
    const gate = new LoadGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
  });

  it("lets a new load start after the previous load ended", () => {
    const gate = new LoadGate();
    gate.start();
    gate.end();
    assert.strictEqual(gate.start(), true);
  });

  it("reports the dirty flag only once", () => {
    const gate = new LoadGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
    gate.start();
    assert.strictEqual(gate.end(), false);
  });

  it("still asks for one more load when several requests join the same in-flight load", () => {
    // Any number of joiners while one load is in flight must still cost at
    // most one extra load: `dirty` is a flag, not a counter.
    const gate = new LoadGate();
    gate.start();
    gate.start();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
    assert.strictEqual(gate.end(), false);
  });
});
