import { isAllowedGuestUrl } from "./address";
import { profileIdFromPartition } from "./profiles";

// A `<webview>` attaches only with an http, https, or blank address, in an
// AI1 profile partition. Everything else fails closed.
export function shouldAttachGuest(src: string, partition: string | undefined): boolean {
  return isAllowedGuestUrl(src) && partition !== undefined && profileIdFromPartition(partition) !== undefined;
}

// The page security of Orca's `will-attach-webview` handler: no preload, no
// Node, and a sandboxed, isolated page.
export function forceGuestPreferences(preferences: Record<string, unknown>): void {
  delete preferences.preload;
  delete preferences.preloadURL;
  delete preferences.additionalArguments;
  preferences.nodeIntegration = false;
  preferences.nodeIntegrationInSubFrames = false;
  preferences.contextIsolation = true;
  preferences.sandbox = true;
  preferences.webSecurity = true;
  preferences.allowRunningInsecureContent = false;
}

// Orca's list, plus `media`: when AI1 grants it, macOS asks the owner for the
// camera or the microphone.
const ALLOWED_PERMISSIONS = new Set([
  "fullscreen",
  "clipboard-read",
  "clipboard-sanitized-write",
  "notifications",
  "persistent-storage",
  "pointerLock",
  "storage-access",
  "media",
]);

export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

export type PopupAction = "tab" | "window" | "deny";

// `new-window` is a `window.open` with window features, which a login popup
// uses: it stays a window, so `window.opener` works. An empty popup also
// stays a window, because a script writes into it. A link with
// `target=_blank` becomes a tab.
export function decidePopup(url: string, disposition: string): PopupAction {
  if (!isAllowedGuestUrl(url)) {
    return "deny";
  }
  if (disposition === "new-window" || url === "about:blank") {
    return "window";
  }
  return "tab";
}

export function isLocalCertificateHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function uniqueDownloadName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) {
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 1; ; index++) {
    const candidate = `${stem} (${index})${extension}`;
    if (!exists(candidate)) {
      return candidate;
    }
  }
}

// Electron keeps a `persist:<name>` session in the folder
// `<user data>/Partitions/<name>`. A popup window of an AI1 page has the
// session of its profile, so this folder name tells that it belongs to AI1.
export function profileIdFromStoragePath(storagePath: string | null | undefined): string | undefined {
  if (!storagePath) {
    return undefined;
  }
  const parts = storagePath.split(/[\\/]/).filter((part) => part !== "");
  const last = parts[parts.length - 1];
  return last === undefined ? undefined : profileIdFromPartition(`persist:${last}`);
}
