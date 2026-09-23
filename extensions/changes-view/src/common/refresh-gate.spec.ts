import * as assert from "node:assert";
import { RefreshGate } from "./refresh-gate";

describe("RefreshGate", () => {
  it("lets the first run start", () => {
    const gate = new RefreshGate();
    assert.strictEqual(gate.start(), true);
  });

  it("blocks a second start while the first run is in flight, and records it as dirty", () => {
    const gate = new RefreshGate();
    gate.start();
    assert.strictEqual(gate.start(), false);
  });

  it("does not ask for another run when nothing happened while a run was in flight", () => {
    const gate = new RefreshGate();
    gate.start();
    assert.strictEqual(gate.end(), false);
  });

  it("asks for another run when a start was blocked while a run was in flight", () => {
    const gate = new RefreshGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
  });

  it("lets a new run start after the previous run ended", () => {
    const gate = new RefreshGate();
    gate.start();
    gate.end();
    assert.strictEqual(gate.start(), true);
  });

  it("reports the dirty flag only once", () => {
    const gate = new RefreshGate();
    gate.start();
    gate.start();
    assert.strictEqual(gate.end(), true);
    gate.start();
    assert.strictEqual(gate.end(), false);
  });
});
