// The user agent of Safari on iOS 17.0 on an iPhone.
export const SAFARI_IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// The user agent of Safari on iPadOS 17.0 for a mobile website.
export const SAFARI_IPAD_USER_AGENT =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// The user agent of Chrome on Android 14 on a Pixel 8.
export const PIXEL_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";

export const MIN_CUSTOM_SIZE = 200;
export const MAX_CUSTOM_SIZE = 4000;

export interface ViewportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent?: string;
}

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  {
    id: "iphone-15",
    label: "iPhone 15",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent: SAFARI_IPHONE_USER_AGENT,
  },
  {
    id: "pixel-8",
    label: "Pixel 8",
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    userAgent: PIXEL_USER_AGENT,
  },
  {
    id: "ipad-air",
    label: "iPad Air",
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent: SAFARI_IPAD_USER_AGENT,
  },
  {
    id: "ipad-pro-12-9",
    label: "iPad Pro 12.9",
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent: SAFARI_IPAD_USER_AGENT,
  },
];

// The viewport of a browser tab: the full tab ("off"), a preset, or a custom
// size.
export type ViewportChoice =
  | { kind: "off" }
  | { kind: "preset"; id: string; rotated: boolean }
  | { kind: "custom"; width: number; height: number };

// The values that AI1 sends to the page. A `deviceScaleFactor` of 0 keeps the
// ratio of the screen. With no `userAgent`, the page gets its default user
// agent.
export interface ViewportSettings {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent?: string;
}

function sizeError(value: number, name: string): string | undefined {
  return Number.isInteger(value) && value >= MIN_CUSTOM_SIZE && value <= MAX_CUSTOM_SIZE
    ? undefined
    : `The ${name} must be a whole number from ${MIN_CUSTOM_SIZE} to ${MAX_CUSTOM_SIZE}.`;
}

// The error text for a custom size, or `undefined` when the size is correct.
export function validateCustomSize(width: number, height: number): string | undefined {
  return sizeError(width, "width") ?? sizeError(height, "height");
}

// The settings of a choice, or `undefined` for "off" and for a choice that is
// not correct (the value can come from a saved layout or from IPC).
export function resolveViewport(choice: ViewportChoice): ViewportSettings | undefined {
  if (typeof choice !== "object" || choice === null) {
    return undefined;
  }
  if (choice.kind === "preset") {
    const preset = VIEWPORT_PRESETS.find((candidate) => candidate.id === choice.id);
    if (!preset) {
      return undefined;
    }
    const rotated = choice.rotated === true;
    return {
      width: rotated ? preset.height : preset.width,
      height: rotated ? preset.width : preset.height,
      deviceScaleFactor: preset.deviceScaleFactor,
      mobile: preset.mobile,
      ...(preset.userAgent === undefined ? {} : { userAgent: preset.userAgent }),
    };
  }
  if (choice.kind === "custom") {
    if (validateCustomSize(choice.width, choice.height) !== undefined) {
      return undefined;
    }
    return { width: choice.width, height: choice.height, deviceScaleFactor: 0, mobile: false };
  }
  return undefined;
}
