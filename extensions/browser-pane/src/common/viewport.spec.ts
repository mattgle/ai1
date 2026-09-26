import * as assert from "node:assert";
import {
  PIXEL_USER_AGENT,
  resolveViewport,
  SAFARI_IPAD_USER_AGENT,
  SAFARI_IPHONE_USER_AGENT,
  validateCustomSize,
  VIEWPORT_PRESETS,
  ViewportChoice,
} from "./viewport";

describe("validateCustomSize", () => {
  it("accepts whole numbers from 200 to 4000", () => {
    assert.strictEqual(validateCustomSize(390, 844), undefined);
    assert.strictEqual(validateCustomSize(200, 4000), undefined);
  });

  it("gives an error for a width or a height out of the range", () => {
    assert.match(validateCustomSize(199, 844) ?? "", /width/);
    assert.match(validateCustomSize(390, 4001) ?? "", /height/);
  });

  it("gives an error for a value that is not a whole number", () => {
    assert.match(validateCustomSize(1.5, 844) ?? "", /width/);
    assert.match(validateCustomSize(390, Number.NaN) ?? "", /height/);
  });
});

describe("VIEWPORT_PRESETS", () => {
  it("has the four devices with the sizes and ratios of the spec", () => {
    assert.deepStrictEqual(
      VIEWPORT_PRESETS.map((preset) => [preset.id, preset.width, preset.height, preset.deviceScaleFactor]),
      [
        ["iphone-15", 393, 852, 3],
        ["pixel-8", 412, 915, 2.625],
        ["ipad-air", 820, 1180, 2],
        ["ipad-pro-12-9", 1024, 1366, 2],
      ],
    );
  });

  it("makes all presets mobile, with the user agent of the device", () => {
    assert.ok(VIEWPORT_PRESETS.every((preset) => preset.mobile));
    assert.deepStrictEqual(
      VIEWPORT_PRESETS.map((preset) => preset.userAgent),
      [SAFARI_IPHONE_USER_AGENT, PIXEL_USER_AGENT, SAFARI_IPAD_USER_AGENT, SAFARI_IPAD_USER_AGENT],
    );
    assert.match(SAFARI_IPHONE_USER_AGENT, /iPhone OS 17_0 .* Version\/17\.0 Mobile\/15E148 Safari/);
    assert.match(SAFARI_IPAD_USER_AGENT, /iPad; CPU OS 17_0 .* Version\/17\.0 Mobile\/15E148 Safari/);
    assert.match(PIXEL_USER_AGENT, /Android 14; Pixel 8\).* Chrome\/[\d.]+ Mobile Safari/);
  });
});

describe("resolveViewport", () => {
  it("gives undefined for off", () => {
    assert.strictEqual(resolveViewport({ kind: "off" }), undefined);
  });

  it("gives the settings of a preset", () => {
    assert.deepStrictEqual(resolveViewport({ kind: "preset", id: "iphone-15", rotated: false }), {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: SAFARI_IPHONE_USER_AGENT,
    });
  });

  it("swaps the width and the height of a rotated preset", () => {
    const settings = resolveViewport({ kind: "preset", id: "iphone-15", rotated: true });
    assert.strictEqual(settings?.width, 852);
    assert.strictEqual(settings?.height, 393);
  });

  it("gives a custom size that is not mobile, with the ratio of the screen and no user agent", () => {
    assert.deepStrictEqual(resolveViewport({ kind: "custom", width: 800, height: 600 }), {
      width: 800,
      height: 600,
      deviceScaleFactor: 0,
      mobile: false,
    });
  });

  it("gives undefined for an unknown preset, a bad custom size, or a value that is not a choice", () => {
    assert.strictEqual(resolveViewport({ kind: "preset", id: "nokia", rotated: false }), undefined);
    assert.strictEqual(resolveViewport({ kind: "custom", width: 100, height: 600 }), undefined);
    assert.strictEqual(resolveViewport(null as unknown as ViewportChoice), undefined);
    assert.strictEqual(resolveViewport({ kind: "other" } as unknown as ViewportChoice), undefined);
  });
});
