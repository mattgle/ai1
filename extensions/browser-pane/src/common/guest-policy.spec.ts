import * as assert from "node:assert";
import {
  decidePopup,
  forceGuestPreferences,
  isLocalCertificateHost,
  isPermissionAllowed,
  POPUP_LIMIT,
  POPUP_WINDOW_MS,
  popupAllowed,
  profileIdFromStoragePath,
  shouldAttachGuest,
  shouldStopNavigation,
  uniqueDownloadName,
} from "./guest-policy";

describe("shouldAttachGuest", () => {
  it("attaches an http page in an AI1 profile partition", () => {
    assert.strictEqual(shouldAttachGuest("http://localhost:3000/", "persist:ai1-browser-default"), true);
    assert.strictEqual(shouldAttachGuest("about:blank", "persist:ai1-browser-agent"), true);
  });

  it("refuses another scheme, another partition, or no partition", () => {
    assert.strictEqual(shouldAttachGuest("file:///etc/hosts", "persist:ai1-browser-default"), false);
    assert.strictEqual(shouldAttachGuest("https://example.com/", "persist:other"), false);
    assert.strictEqual(shouldAttachGuest("https://example.com/", undefined), false);
  });
});

describe("forceGuestPreferences", () => {
  it("removes the preload and locks the page down", () => {
    const preferences: Record<string, unknown> = {
      preload: "/x/preload.js",
      preloadURL: "file:///x/preload.js",
      additionalArguments: ["--x"],
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
    };
    forceGuestPreferences(preferences);
    assert.deepStrictEqual(preferences, {
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it("turns off the webview tag, so a page cannot hold a nested page", () => {
    const preferences: Record<string, unknown> = {};
    forceGuestPreferences(preferences);
    assert.strictEqual(preferences.webviewTag, false);
  });
});

describe("isPermissionAllowed", () => {
  it("allows the short list and the camera and microphone", () => {
    for (const permission of [
      "fullscreen",
      "clipboard-read",
      "clipboard-sanitized-write",
      "notifications",
      "persistent-storage",
      "pointerLock",
      "storage-access",
      "media",
    ]) {
      assert.strictEqual(isPermissionAllowed(permission), true, permission);
    }
  });

  it("refuses all other permissions", () => {
    for (const permission of [
      "geolocation",
      "midi",
      "hid",
      "serial",
      "usb",
      "openExternal",
      "display-capture",
    ]) {
      assert.strictEqual(isPermissionAllowed(permission), false, permission);
    }
  });
});

describe("decidePopup", () => {
  it("opens a window.open with window features as a small window", () => {
    assert.strictEqual(decidePopup("https://accounts.example.com/login", "new-window"), "window");
  });

  it("opens a target=_blank link or a plain window.open as a new tab", () => {
    assert.strictEqual(decidePopup("https://example.com/", "foreground-tab"), "tab");
    assert.strictEqual(decidePopup("https://example.com/", "background-tab"), "tab");
  });

  it("opens an empty popup as a window, because a script writes into it", () => {
    assert.strictEqual(decidePopup("about:blank", "foreground-tab"), "window");
  });

  it("refuses a popup to another scheme", () => {
    assert.strictEqual(decidePopup("file:///etc/hosts", "new-window"), "deny");
    assert.strictEqual(decidePopup("javascript:alert(1)", "foreground-tab"), "deny");
  });
});

describe("isLocalCertificateHost", () => {
  it("is true for the local host names only", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
      assert.strictEqual(isLocalCertificateHost(host), true, host);
    }
    for (const host of ["example.com", "localhost.example.com", "10.0.0.1"]) {
      assert.strictEqual(isLocalCertificateHost(host), false, host);
    }
  });
});

describe("uniqueDownloadName", () => {
  it("keeps a free name", () => {
    assert.strictEqual(
      uniqueDownloadName("report.pdf", () => false),
      "report.pdf",
    );
  });

  it("adds a number before the extension when the name is in use", () => {
    const used = new Set(["report.pdf", "report (1).pdf"]);
    assert.strictEqual(
      uniqueDownloadName("report.pdf", (name) => used.has(name)),
      "report (2).pdf",
    );
    assert.strictEqual(
      uniqueDownloadName("notes", (name) => name === "notes"),
      "notes (1)",
    );
  });
});

describe("profileIdFromStoragePath", () => {
  it("reads the profile id from the partition folder of an AI1 profile", () => {
    assert.strictEqual(profileIdFromStoragePath("/data/Partitions/ai1-browser-default"), "default");
    assert.strictEqual(profileIdFromStoragePath("/data/Partitions/ai1-browser-p-0a1b2c3d/"), "p-0a1b2c3d");
    assert.strictEqual(profileIdFromStoragePath("/x/Partitions/ai1-browser-default"), "default");
    assert.strictEqual(profileIdFromStoragePath("C:\\data\\Partitions\\ai1-browser-agent"), "agent");
  });

  it("gives no id for the default session or another partition", () => {
    assert.strictEqual(profileIdFromStoragePath("/data"), undefined);
    assert.strictEqual(profileIdFromStoragePath("/x/ai1-browser-default"), undefined);
    assert.strictEqual(profileIdFromStoragePath("/x/Other/ai1-browser-default"), undefined);
    assert.strictEqual(profileIdFromStoragePath("ai1-browser-default"), undefined);
    assert.strictEqual(profileIdFromStoragePath("/data/Partitions/other"), undefined);
    assert.strictEqual(profileIdFromStoragePath(null), undefined);
    assert.strictEqual(profileIdFromStoragePath(undefined), undefined);
  });
});

describe("shouldStopNavigation", () => {
  it("stops a main-frame navigation to an address that is not http, https, or about:blank", () => {
    for (const url of [
      "file:///etc/hosts",
      "chrome://version",
      "data:text/html,x",
      "view-source:http://a/",
    ]) {
      assert.strictEqual(shouldStopNavigation(url, true, false), true, url);
    }
  });

  it("lets web addresses, about:blank, and same-document navigations go on", () => {
    assert.strictEqual(shouldStopNavigation("http://127.0.0.1:1/", true, false), false);
    assert.strictEqual(shouldStopNavigation("https://example.com/", true, false), false);
    assert.strictEqual(shouldStopNavigation("about:blank", true, false), false);
    assert.strictEqual(shouldStopNavigation("file:///etc/hosts", true, true), false);
  });

  it("leaves a subframe to Chromium, which does not load a local file in a web page", () => {
    assert.strictEqual(shouldStopNavigation("file:///etc/hosts", false, false), false);
  });
});

describe("popupAllowed", () => {
  const now = 100_000;

  it("allows up to five popups in ten seconds", () => {
    assert.strictEqual(POPUP_LIMIT, 5);
    assert.strictEqual(POPUP_WINDOW_MS, 10_000);
    assert.strictEqual(popupAllowed([], now), true);
    assert.strictEqual(popupAllowed([now - 4000, now - 3000, now - 2000, now - 1000], now), true);
  });

  it("refuses the sixth popup in ten seconds", () => {
    assert.strictEqual(
      popupAllowed([now - 9999, now - 4000, now - 3000, now - 2000, now - 1000], now),
      false,
    );
  });

  it("allows a popup again when ten seconds have gone by", () => {
    const old = [now - 14_000, now - 13_000, now - 12_000, now - 11_000, now - 10_000];
    assert.strictEqual(popupAllowed(old, now), true);
    assert.strictEqual(
      popupAllowed([now - 10_000, now - 4000, now - 3000, now - 2000, now - 1000], now),
      true,
    );
  });
});
