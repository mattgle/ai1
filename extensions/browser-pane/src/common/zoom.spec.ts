import * as assert from "node:assert";
import { nextZoom, ZOOM_STEPS, zoomKey } from "./zoom";

describe("nextZoom", () => {
  it("goes from 100 to the next step up or down", () => {
    assert.strictEqual(nextZoom(100, 1), 110);
    assert.strictEqual(nextZoom(100, -1), 90);
  });

  it("stays at the ends", () => {
    assert.strictEqual(nextZoom(500, 1), 500);
    assert.strictEqual(nextZoom(25, -1), 25);
  });

  it("goes from a value between two steps to the nearest step in that direction", () => {
    assert.strictEqual(nextZoom(105, 1), 110);
    assert.strictEqual(nextZoom(105, -1), 100);
  });

  it("goes to the nearest end from a value out of the range", () => {
    assert.strictEqual(nextZoom(1000, -1), 500);
    assert.strictEqual(nextZoom(10, 1), 25);
  });

  it("walks through all steps", () => {
    const up = [25];
    while (up[up.length - 1] !== 500) {
      up.push(nextZoom(up[up.length - 1], 1));
    }
    assert.deepStrictEqual(up, ZOOM_STEPS);
  });
});

describe("zoomKey", () => {
  it("gives the profile and the host name", () => {
    assert.strictEqual(zoomKey("default", "http://localhost:3000/a"), "default localhost");
    assert.strictEqual(zoomKey("agent", "https://example.com/path?q=1#x"), "agent example.com");
  });

  it("gives the same key for two ports of the same host, the same as Chrome", () => {
    assert.strictEqual(
      zoomKey("default", "http://localhost:3000/"),
      zoomKey("default", "http://localhost:5173/"),
    );
  });

  it("gives undefined for a page with no http or https host", () => {
    assert.strictEqual(zoomKey("default", "about:blank"), undefined);
    assert.strictEqual(zoomKey("default", "data:text/html,error"), undefined);
    assert.strictEqual(zoomKey("default", "file:///etc/hosts"), undefined);
    assert.strictEqual(zoomKey("default", "not an address"), undefined);
  });
});
