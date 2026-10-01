import { app, BrowserWindow, session, WebContents, webContents } from "@theia/core/electron-shared/electron";
import { inject, injectable } from "@theia/core/shared/inversify";
import * as fs from "node:fs";
import * as path from "node:path";
import { isAllowedGuestUrl } from "../common/address";
import { CertificateErrorEvent, Channels, OpenTabRequest, ShortcutEvent } from "../common/browser-ipc";
import { E2E_DOWNLOADS_DIR, e2eSetting } from "../common/downloads";
import {
  decidePopup,
  forceGuestPreferences,
  isLocalCertificateHost,
  isPermissionAllowed,
  POPUP_WINDOW_MS,
  popupAllowed,
  profileIdFromStoragePath,
  shouldAttachGuest,
  shouldStopNavigation,
  uniqueDownloadName,
} from "../common/guest-policy";
import { DEFAULT_PROFILE_ID, partitionFor, profileIdFromPartition } from "../common/profiles";
import { shortcutFor, ShortcutInput } from "../common/shortcuts";
import { DownloadTracker } from "./download-tracker";
import { GuestRegistry } from "./guest-registry";
import { HistoryRecorder, HistorySink } from "./history-recorder";

const POPUP_NOTICE = "A page tried to open too many popups. AI1 blocked the rest.";

// The rules for the pages of the AI1 browser: the attach check, popups,
// navigation, local files, permissions, downloads, and certificate errors.
@injectable()
export class GuestPolicies {
  protected readonly preparedSessions = new Set<string>();
  // Hosts whose certificate error the owner accepted. Only local hosts can
  // get here. The set lives until AI1 closes.
  protected readonly acceptedCertificateHosts = new Set<string>();

  // The guests whose find bar is open.
  protected readonly findOpenGuests = new Set<number>();
  // True for a guest with a connected agent. `AgentAddress` sets it: it
  // injects this class, so this class cannot inject it.
  protected agentConnected: (guestId: number) => boolean = () => false;
  // `BrowserMainContribution` makes it in `onStart`, before the first page.
  protected downloads: DownloadTracker | undefined;
  // `BrowserMainContribution` sets it in `onStart`, before the first page.
  protected historyRecorder: HistoryRecorder | undefined;

  @inject(GuestRegistry)
  protected registry!: GuestRegistry;

  setAgentConnectedCheck(check: (guestId: number) => boolean): void {
    this.agentConnected = check;
  }

  setDownloadTracker(tracker: DownloadTracker): void {
    this.downloads = tracker;
  }

  setHistory(history: HistorySink): void {
    this.historyRecorder = new HistoryRecorder(history, (guestId) => this.agentConnected(guestId));
  }

  // The Downloads folder of the user. Only an e2e run can give another
  // folder (see `e2eSetting`).
  downloadsFolder(): string {
    return e2eSetting(process.env, E2E_DOWNLOADS_DIR) ?? app.getPath("downloads");
  }

  setFindOpen(guestId: number, open: boolean): void {
    if (open) {
      this.findOpenGuests.add(guestId);
    } else {
      this.findOpenGuests.delete(guestId);
    }
  }

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

  // A `<webview>` page or a popup window with the session of an AI1
  // profile. A `<webview>` in another session is not an AI1 page.
  isAi1BrowserContents(contents: WebContents): boolean {
    return profileIdFromStoragePath(contents.session.storagePath) !== undefined;
  }

  attach(contents: WebContents): void {
    contents.setBackgroundThrottling(false);
    // A focused page gets the key events before the Theia window, so the
    // Theia keybindings do not see them. Catch the browser shortcuts here
    // and send them to the window of the tab.
    contents.on("before-input-event", (event, input) => this.onInput(contents, event, input));
    contents.on("destroyed", () => this.findOpenGuests.delete(contents.id));
    this.historyRecorder?.attach(contents);
    // A page cannot hold a nested `<webview>` page. `webviewTag` is off, and
    // this refuses the attach if a page gets one all the same.
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-navigate", (event) => {
      if (!isAllowedGuestUrl(event.url)) {
        event.preventDefault();
      }
    });
    // `will-navigate` is only for navigations that the page starts. Replace
    // the others with an empty page. Do not call `contents.stop()` in this
    // event: it ends the main process. A new navigation cancels the pending
    // one, before it commits.
    contents.on("did-start-navigation", (event) => {
      if (shouldStopNavigation(event.url, event.isMainFrame, event.isSameDocument)) {
        setImmediate(() => {
          if (!contents.isDestroyed()) {
            contents.loadURL("about:blank").catch(() => undefined);
          }
        });
      }
    });
    // The times of the popups that this page opened, and whether the owner
    // got the notice for the current burst of refused popups.
    let popupTimes: number[] = [];
    let burstNoticeSent = false;
    contents.setWindowOpenHandler((details) => {
      const action = decidePopup(details.url, details.disposition);
      if (action === "deny") {
        return { action: "deny" };
      }
      const now = this.now();
      popupTimes = popupTimes.filter((time) => now - time < POPUP_WINDOW_MS);
      if (!popupAllowed(popupTimes, now)) {
        if (!burstNoticeSent) {
          burstNoticeSent = true;
          this.sendToWindowOf(contents, Channels.notice, POPUP_NOTICE);
        }
        return { action: "deny" };
      }
      popupTimes.push(now);
      burstNoticeSent = false;
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
              webviewTag: false,
            },
          },
        };
      }
      return { action: "deny" };
    });
  }

  protected shortcutPlatform(): string {
    return process.platform;
  }

  protected onInput(contents: WebContents, event: { preventDefault(): void }, input: ShortcutInput): void {
    // The page of a connected agent gets all keys unchanged.
    if (input.type !== "keyDown" || this.agentConnected(contents.id)) {
      return;
    }
    const shortcut = shortcutFor(input, this.findOpenGuests.has(contents.id), this.shortcutPlatform());
    // A page that is not a browser tab (for example a popup window) keeps
    // its keys.
    const entry = this.registry.entry(contents.id);
    if (shortcut === undefined || entry === undefined) {
      return;
    }
    event.preventDefault();
    const payload: ShortcutEvent = { tabId: entry.tabId, shortcut };
    const window = this.contentsFromId(entry.windowId);
    if (window && !window.isDestroyed()) {
      window.send(Channels.shortcut, payload);
    }
  }

  ensureSession(partition: string): void {
    if (this.preparedSessions.has(partition) || profileIdFromPartition(partition) === undefined) {
      return;
    }
    this.preparedSessions.add(partition);
    const target = session.fromPartition(partition);
    // No page of an AI1 profile loads a local file: not a navigation, not a
    // fetch, and not a subresource. The navigation checks stay as a second
    // layer.
    target.protocol.handle("file", () => Response.error());
    target.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(isPermissionAllowed(permission)),
    );
    target.setPermissionCheckHandler((_contents, permission) => isPermissionAllowed(permission));
    const profileId = profileIdFromPartition(partition) ?? DEFAULT_PROFILE_ID;
    target.on("will-download", (_event, item, contents) => {
      const folder = this.downloadsFolder();
      const name = uniqueDownloadName(item.getFilename(), (candidate) =>
        fs.existsSync(path.join(folder, candidate)),
      );
      const savePath = path.join(folder, name);
      if (!this.downloads) {
        item.setSavePath(savePath);
        return;
      }
      this.downloads.start(item, savePath, profileId, (done) =>
        this.sendToWindowOf(contents, Channels.downloadDone, done),
      );
    });
  }

  // Only for a local host, and only for an AI1 page that exists.
  acceptCertificate(webContentsId: number, host: string): void {
    const guest = this.contentsFromId(webContentsId);
    if (!isLocalCertificateHost(host) || !guest || guest.isDestroyed() || !this.isAi1BrowserContents(guest)) {
      return;
    }
    this.acceptedCertificateHosts.add(host);
    guest.reload();
  }

  protected contentsFromId(id: number): WebContents | undefined {
    return webContents.fromId(id);
  }

  protected now(): number {
    return Date.now();
  }

  // Sends to the Theia window that shows this page: the embedder of a
  // `<webview>`, or else the focused (or first) Theia window. A popup window
  // of a page is never the target. A destroyed page (for example the closed
  // tab of a download) throws when code reads `hostWebContents`, so it uses
  // the Theia window.
  sendToWindowOf(contents: WebContents, channel: string, payload: unknown): void {
    const embedder =
      (contents.isDestroyed() ? undefined : contents.hostWebContents) ?? this.theiaWindowContents();
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
