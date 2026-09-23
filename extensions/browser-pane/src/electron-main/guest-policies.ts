import { app, BrowserWindow, session, WebContents, webContents } from "@theia/core/electron-shared/electron";
import { injectable } from "@theia/core/shared/inversify";
import * as fs from "node:fs";
import * as path from "node:path";
import { isAllowedGuestUrl } from "../common/address";
import { CertificateErrorEvent, Channels, OpenTabRequest } from "../common/browser-ipc";
import {
  decidePopup,
  forceGuestPreferences,
  isLocalCertificateHost,
  isPermissionAllowed,
  profileIdFromStoragePath,
  shouldAttachGuest,
  uniqueDownloadName,
} from "../common/guest-policy";
import { DEFAULT_PROFILE_ID, partitionFor, profileIdFromPartition } from "../common/profiles";

// The rules for the pages of the AI1 browser: the attach check, popups,
// navigation, permissions, downloads, and certificate errors.
@injectable()
export class GuestPolicies {
  protected readonly preparedSessions = new Set<string>();
  // Hosts whose certificate error the owner accepted. Only local hosts can
  // get here. The set lives until AI1 closes.
  protected readonly acceptedCertificateHosts = new Set<string>();

  install(): void {
    app.on("certificate-error", (event, contents, url, error, _certificate, callback) => {
      if (!this.isAi1BrowserContents(contents)) {
        return;
      }
      event.preventDefault();
      const host = new URL(url).hostname;
      if (this.acceptedCertificateHosts.has(host)) {
        callback(true);
        return;
      }
      callback(false);
      const payload: CertificateErrorEvent = { webContentsId: contents.id, url, host, error };
      this.sendToWindowOf(contents, Channels.certificateError, payload);
    });
  }

  // Called for each new web contents of a Theia window: the check that
  // `will-attach-webview` runs before a `<webview>` gets its page.
  guardWebviewAttach(embedder: WebContents): void {
    embedder.on("will-attach-webview", (event, webPreferences, params) => {
      if (!shouldAttachGuest(params.src, params.partition)) {
        event.preventDefault();
        return;
      }
      forceGuestPreferences(webPreferences as unknown as Record<string, unknown>);
      this.ensureSession(params.partition);
    });
  }

  // A `<webview>` page, or a popup window that a page of an AI1 profile
  // opened (it has the session of that profile).
  isAi1BrowserContents(contents: WebContents): boolean {
    return (
      contents.getType() === "webview" || profileIdFromStoragePath(contents.session.storagePath) !== undefined
    );
  }

  attach(contents: WebContents): void {
    contents.setBackgroundThrottling(false);
    contents.on("will-navigate", (event) => {
      if (!isAllowedGuestUrl(event.url)) {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler((details) => {
      const action = decidePopup(details.url, details.disposition);
      const profileId = profileIdFromStoragePath(contents.session.storagePath) ?? DEFAULT_PROFILE_ID;
      if (action === "tab") {
        const request: OpenTabRequest = { url: details.url, profileId };
        this.sendToWindowOf(contents, Channels.openTab, request);
        return { action: "deny" };
      }
      if (action === "window") {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            webPreferences: {
              partition: partitionFor(profileId),
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
      return { action: "deny" };
    });
  }

  ensureSession(partition: string): void {
    if (this.preparedSessions.has(partition) || profileIdFromPartition(partition) === undefined) {
      return;
    }
    this.preparedSessions.add(partition);
    const target = session.fromPartition(partition);
    target.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(isPermissionAllowed(permission)),
    );
    target.setPermissionCheckHandler((_contents, permission) => isPermissionAllowed(permission));
    target.on("will-download", (_event, item, contents) => {
      const folder = app.getPath("downloads");
      const name = uniqueDownloadName(item.getFilename(), (candidate) =>
        fs.existsSync(path.join(folder, candidate)),
      );
      item.setSavePath(path.join(folder, name));
      item.once("done", (_doneEvent, state) => {
        const text =
          state === "completed"
            ? `Downloaded ${name} to the Downloads folder.`
            : `The download of ${name} did not complete.`;
        this.sendToWindowOf(contents, Channels.notice, text);
      });
    });
  }

  acceptCertificate(webContentsId: number, host: string): void {
    if (!isLocalCertificateHost(host)) {
      return;
    }
    this.acceptedCertificateHosts.add(host);
    const guest = webContents.fromId(webContentsId);
    if (guest && !guest.isDestroyed()) {
      guest.reload();
    }
  }

  // Sends to the Theia window that shows this page: the embedder of a
  // `<webview>`, or else the focused (or first) Theia window. A popup window
  // of a page is never the target.
  sendToWindowOf(contents: WebContents, channel: string, payload: unknown): void {
    const embedder = contents.hostWebContents ?? this.theiaWindowContents();
    if (embedder && !embedder.isDestroyed()) {
      embedder.send(channel, payload);
    }
  }

  protected theiaWindowContents(): WebContents | undefined {
    const windows = BrowserWindow.getAllWindows().filter(
      (window) => !window.isDestroyed() && !this.isAi1BrowserContents(window.webContents),
    );
    const focused = windows.find((window) => window.isFocused());
    return (focused ?? windows[0])?.webContents;
  }
}
