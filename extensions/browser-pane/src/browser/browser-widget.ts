import { BaseWidget, StatefulWidget } from "@theia/core/lib/browser";
import { ContextKeyService } from "@theia/core/lib/browser/context-key-service";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import type { WebviewTag } from "electron";
import { normalizeAddress } from "../common/address";
import { AgentTabState, CertificateErrorEvent } from "../common/browser-ipc";
import { isLocalCertificateHost } from "../common/guest-policy";
import { DEFAULT_PROFILE_ID, partitionFor, Profile } from "../common/profiles";
import { BrowserShortcut } from "../common/shortcuts";
import { nextZoom, zoomKey } from "../common/zoom";
import { browserApi } from "./browser-api";
import { FindBar } from "./find-bar";

// The context keys of a browser tab. They are local keys: a scoped context
// on the node of the tab (and on its find bar) holds them. Theia gives a
// keybinding whose `when` uses a local key of the focused element priority
// over other keybindings with the same keys
// (`KeybindingRegistry.selectBindingByLocalContext`). Thus the browser
// keybindings win over, for example, the Source Control toggle (⇧⌘G) and
// the core Find (⌘F) while a browser tab has the focus, and they do not run
// anywhere else.
export const BROWSER_FOCUS_CONTEXT = "ai1BrowserFocus";
export const BROWSER_FIND_FOCUS_CONTEXT = "ai1BrowserFindFocus";

export const BrowserWidgetOptions = Symbol("BrowserWidgetOptions");
export interface BrowserWidgetOptions {
  tabId: string;
  url: string;
  profileId: string;
}

interface BrowserTabState {
  url: string;
  profileId: string;
}

// One browser tab: a toolbar and one `<webview>`. The `<webview>` is made
// once for each profile and never gets a new parent element (a new parent
// loads the page again). A change of profile makes a new `<webview>`,
// because a partition cannot change after the first navigation.
@injectable()
export class BrowserWidget extends BaseWidget implements StatefulWidget {
  static readonly FACTORY_ID = "ai1-browser";

  @inject(BrowserWidgetOptions)
  protected readonly options!: BrowserWidgetOptions;

  @inject(ContextKeyService)
  protected readonly contextKeys!: ContextKeyService;

  protected url = "about:blank";
  protected profile = DEFAULT_PROFILE_ID;
  protected profileList: Profile[] = [];
  protected webview: WebviewTag | undefined;
  protected registeredGuestId: number | undefined;
  // The methods of a `<webview>` work only after its first `dom-ready`
  // event. Until then, `navigate` keeps the address in `pendingUrl`.
  protected webviewReady = false;
  protected pendingUrl: string | undefined;
  protected agentState: AgentTabState | undefined;
  // The title of the page (or of the error). The tab label adds the agent
  // number to it while an agent is connected.
  protected pageTitle = "New Tab";
  // The zoom of the current page: the address of the last main-frame
  // navigation, its `zoomKey`, and its level in percent.
  protected zoomUrl: string | undefined;
  protected pageZoomKey: string | undefined;
  protected zoomPercent = 100;
  protected readonly toolbar = document.createElement("div");
  protected readonly backButton = document.createElement("button");
  protected readonly forwardButton = document.createElement("button");
  protected readonly reloadButton = document.createElement("button");
  protected readonly addressInput = document.createElement("input");
  protected readonly zoomButton = document.createElement("button");
  protected readonly profileSelect = document.createElement("select");
  protected readonly agentButton = document.createElement("button");
  protected readonly devToolsButton = document.createElement("button");
  protected readonly message = document.createElement("div");
  protected readonly viewport = document.createElement("div");
  protected readonly errorPanel = document.createElement("div");
  protected readonly findBar = new FindBar({
    find: (text, options) =>
      this.webview && this.webviewReady ? this.webview.findInPage(text, options) : undefined,
    stop: () => {
      if (this.webview && this.webviewReady) {
        this.webview.stopFindInPage("clearSelection");
      }
    },
    openChanged: (open) => {
      const guestId = this.currentGuestId();
      if (guestId !== undefined) {
        void browserApi()
          .setFindOpen(guestId, open)
          .catch(() => undefined);
      }
    },
    returnFocus: () => this.webview?.focus(),
  });

  get tabId(): string {
    return this.options.tabId;
  }

  get profileId(): string {
    return this.profile;
  }

  get currentUrl(): string {
    return this.url;
  }

  // True while an agent is connected to this tab.
  get agentConnected(): boolean {
    return this.agentState?.state === "connected";
  }

  @postConstruct()
  protected init(): void {
    this.id = `${BrowserWidget.FACTORY_ID}:${this.options.tabId}`;
    this.url = this.options.url;
    this.profile = this.options.profileId;
    this.updateLabel();
    this.updateCaption();
    this.title.closable = true;
    this.title.iconClass = "codicon codicon-globe";
    this.addClass("ai1-browser");
    this.buildToolbar();
    this.message.className = "ai1-browser-message";
    this.message.hidden = true;
    this.viewport.className = "ai1-browser-viewport";
    this.errorPanel.className = "ai1-browser-error";
    this.errorPanel.hidden = true;
    this.viewport.appendChild(this.errorPanel);
    this.node.append(this.toolbar, this.findBar.node, this.message, this.viewport);
    const tabContext = this.contextKeys.createScoped(this.node);
    tabContext.createKey(BROWSER_FOCUS_CONTEXT, true);
    // The find bar has its own scope, so the Esc keybinding works only in
    // the find bar. Only the nearest scope gives local keys, so this scope
    // also holds the key of the tab.
    const findContext = tabContext.createScoped(this.findBar.node);
    findContext.createKey(BROWSER_FOCUS_CONTEXT, true);
    findContext.createKey(BROWSER_FIND_FOCUS_CONTEXT, true);
    this.toDispose.push(findContext);
    this.toDispose.push(tabContext);
    this.toDispose.push({
      dispose: browserApi().onCertificateError((event) => this.onCertificateError(event)),
    });
    this.toDispose.push({
      dispose: browserApi().onZoomChanged((event) => {
        if (event.key === this.pageZoomKey) {
          this.setZoomLevel(event.percent);
        }
      }),
    });
  }

  storeState(): BrowserTabState {
    return { url: this.url, profileId: this.profile };
  }

  restoreState(oldState: object): void {
    const state = oldState as Partial<BrowserTabState>;
    if (typeof state.url === "string") {
      this.url = state.url;
    }
    if (typeof state.profileId === "string") {
      this.profile = state.profileId;
    }
    // Theia calls this after the widget got the profile list, so check the
    // restored profile again: it can be gone.
    if (this.profileList.length > 0) {
      this.setProfiles(this.profileList);
    }
  }

  protected override onAfterAttach(msg: Parameters<BaseWidget["onAfterAttach"]>[0]): void {
    super.onAfterAttach(msg);
    if (!this.webview) {
      this.createWebview(this.url);
    }
  }

  protected override onActivateRequest(msg: Parameters<BaseWidget["onActivateRequest"]>[0]): void {
    super.onActivateRequest(msg);
    if (this.url === "about:blank") {
      this.addressInput.focus();
    } else {
      this.webview?.focus();
    }
  }

  focusAddress(): void {
    this.addressInput.focus();
    this.addressInput.select();
  }

  // The one entry point for the browser shortcuts: from a Theia keybinding,
  // and from the main process when the page has the focus.
  runShortcut(shortcut: BrowserShortcut): void {
    switch (shortcut) {
      case "find":
        this.findBar.open();
        return;
      case "findNext":
        this.findBar.next();
        return;
      case "findPrevious":
        this.findBar.previous();
        return;
      case "closeFind": {
        // From the Esc keybinding the focus is in the find bar, which
        // becomes hidden: give the focus to the page.
        const focusInBar = this.findBar.node.contains(document.activeElement);
        this.findBar.close();
        if (focusInBar) {
          this.webview?.focus();
        }
        return;
      }
      case "focusAddress":
        this.focusAddress();
        return;
      case "zoomIn":
        this.changeZoom(nextZoom(this.zoomPercent, 1));
        return;
      case "zoomOut":
        this.changeZoom(nextZoom(this.zoomPercent, -1));
        return;
      case "zoomReset":
        this.changeZoom(100);
        return;
      default:
        return;
    }
  }

  navigate(input: string): void {
    const result = normalizeAddress(input);
    if (!result.ok) {
      this.showMessage(result.message);
      return;
    }
    this.showMessage(undefined);
    this.hideError();
    this.url = result.url;
    if (this.webview && this.webviewReady) {
      this.webview.loadURL(result.url).catch(() => undefined);
    } else {
      this.pendingUrl = result.url;
    }
  }

  // Called with the new list after each change of the profiles. A tab whose
  // profile is gone moves to Default and loads its page again.
  setProfiles(profiles: Profile[]): void {
    this.profileList = profiles;
    this.fillProfileSelect();
    if (!profiles.some((candidate) => candidate.id === this.profile)) {
      this.switchProfile(DEFAULT_PROFILE_ID);
    }
  }

  // `undefined` makes the tab a normal tab.
  setAgentState(state: AgentTabState | undefined): void {
    this.agentState = state;
    const waiting = state?.state === "waiting";
    const connected = state?.state === "connected";
    this.agentButton.classList.toggle("ai1-browser-agent-active", waiting);
    this.agentButton.disabled = connected;
    this.agentButton.title = connected
      ? "An agent is connected to this tab"
      : waiting
        ? "This tab waits for an agent"
        : "Give this tab to the agent";
    this.title.className = [
      waiting ? "ai1-browser-agent-waiting" : "",
      connected ? "ai1-browser-agent-tab ai1-browser-agent-connected" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");
    this.updateLabel();
    this.updateCaption();
  }

  override dispose(): void {
    // A closed tab cannot wait for an agent.
    if (this.agentState?.state === "waiting") {
      void browserApi()
        .giveToAgent(undefined)
        .catch(() => undefined);
    }
    super.dispose();
  }

  protected setPageTitle(title: string): void {
    this.pageTitle = title;
    this.updateLabel();
  }

  protected updateLabel(): void {
    this.title.label =
      this.agentState?.state === "connected"
        ? `Agent ${this.agentState.number} · ${this.pageTitle}`
        : this.pageTitle;
  }

  protected updateCaption(): void {
    const state = this.agentState?.state;
    this.title.caption =
      state === "waiting"
        ? `${this.url} (waiting for agent)`
        : state === "connected"
          ? `${this.url} (agent connected)`
          : this.url;
  }

  protected switchProfile(profileId: string): void {
    if (profileId === this.profile && this.webview) {
      return;
    }
    this.profile = profileId;
    this.profileSelect.value = profileId;
    // Close the find bar while the old page exists.
    this.findBar.close();
    if (this.webview) {
      this.webview.remove();
      this.webview = undefined;
      this.registeredGuestId = undefined;
      this.hideError();
      this.createWebview(this.url);
    }
  }

  protected buildToolbar(): void {
    this.toolbar.className = "ai1-browser-toolbar";
    const button = (element: HTMLButtonElement, icon: string, title: string, action: () => void): void => {
      element.className = `ai1-browser-button codicon ${icon}`;
      element.title = title;
      element.addEventListener("click", action);
    };
    button(this.backButton, "codicon-arrow-left", "Back", () => this.webview?.goBack());
    button(this.forwardButton, "codicon-arrow-right", "Forward", () => this.webview?.goForward());
    button(this.reloadButton, "codicon-refresh", "Reload", () => {
      this.hideError();
      this.webview?.reload();
    });
    button(this.agentButton, "codicon-hubot", "Give this tab to the agent", () => {
      void browserApi().giveToAgent(this.tabId);
    });
    this.agentButton.classList.add("ai1-browser-give-to-agent");
    button(this.devToolsButton, "codicon-tools", "Open DevTools", () => this.webview?.openDevTools());
    this.backButton.disabled = true;
    this.forwardButton.disabled = true;
    this.addressInput.className = "ai1-browser-address theia-input";
    this.addressInput.placeholder = "Type an address, for example localhost:3000";
    this.addressInput.spellcheck = false;
    this.addressInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.navigate(this.addressInput.value);
      }
    });
    this.zoomButton.className = "ai1-browser-zoom theia-button secondary";
    this.zoomButton.title = "Reset the zoom to 100%";
    this.zoomButton.hidden = true;
    this.zoomButton.addEventListener("click", () => this.changeZoom(100));
    this.profileSelect.className = "ai1-browser-profile theia-select";
    this.profileSelect.title = "Profile of this tab";
    this.profileSelect.addEventListener("change", () => this.switchProfile(this.profileSelect.value));
    this.toolbar.append(
      this.backButton,
      this.forwardButton,
      this.reloadButton,
      this.addressInput,
      this.zoomButton,
      this.profileSelect,
      this.agentButton,
      this.devToolsButton,
    );
  }

  protected fillProfileSelect(): void {
    this.profileSelect.replaceChildren(
      ...this.profileList.map((candidate) => {
        const option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name;
        return option;
      }),
    );
    this.profileSelect.value = this.profile;
  }

  protected createWebview(url: string): void {
    const webview = document.createElement("webview") as WebviewTag;
    webview.setAttribute("partition", partitionFor(this.profile));
    webview.setAttribute("allowpopups", "");
    webview.setAttribute("webpreferences", "disableHtmlFullscreenWindowResize=true,transparent=false");
    webview.className = "ai1-browser-webview";
    webview.addEventListener("dom-ready", () => this.onDomReady(webview));
    // `did-navigate` is only for the main frame.
    webview.addEventListener("did-navigate", (event) => {
      this.findBar.close();
      this.onNavigated(event.url);
      this.updateZoomForPage(event.url);
    });
    webview.addEventListener("found-in-page", (event) => this.findBar.showResult(event.result));
    webview.addEventListener("did-navigate-in-page", (event) => {
      if (event.isMainFrame) {
        this.onNavigated(event.url);
      }
    });
    webview.addEventListener("page-title-updated", (event) => {
      this.setPageTitle(event.title || this.url);
    });
    webview.addEventListener("did-fail-load", (event) => {
      // -3 is ERR_ABORTED: a new navigation replaced this one. -200 to -299
      // are certificate errors: `onCertificateError` shows those.
      const certificateError = event.errorCode <= -200 && event.errorCode >= -299;
      if (event.isMainFrame && event.errorCode !== -3 && !certificateError) {
        this.showError(
          `AI1 Browser cannot open ${event.validatedURL}: ${event.errorDescription}.`,
          "Retry",
          () => this.navigate(event.validatedURL),
        );
      }
    });
    webview.addEventListener("render-process-gone", () => {
      this.showError("The page stopped working.", "Reload", () => webview.reload());
    });
    webview.setAttribute("src", url);
    this.webview = webview;
    this.webviewReady = false;
    this.pendingUrl = undefined;
    this.zoomUrl = undefined;
    this.pageZoomKey = undefined;
    this.setZoomLevel(100);
    this.viewport.insertBefore(webview, this.errorPanel);
  }

  protected onDomReady(webview: WebviewTag): void {
    const firstReady = !this.webviewReady;
    this.webviewReady = true;
    // A navigation before the first `dom-ready` cannot set the zoom.
    if (firstReady) {
      this.applyZoom();
    }
    if (this.pendingUrl !== undefined) {
      const url = this.pendingUrl;
      this.pendingUrl = undefined;
      webview.loadURL(url).catch(() => undefined);
    }
    const guestId = webview.getWebContentsId();
    if (guestId === this.registeredGuestId) {
      return;
    }
    this.registeredGuestId = guestId;
    browserApi()
      .registerGuest(guestId, this.tabId)
      .catch((error) => this.showMessage(String(error)));
  }

  protected onNavigated(url: string): void {
    // The first page of a new `<webview>` must not replace an address that
    // waits for `dom-ready`.
    if (this.pendingUrl !== undefined) {
      return;
    }
    this.url = url;
    this.addressInput.value = url === "about:blank" ? "" : url;
    this.updateCaption();
    this.backButton.disabled = !this.webview?.canGoBack();
    this.forwardButton.disabled = !this.webview?.canGoForward();
    this.hideError();
  }

  // Called after each main-frame navigation, not after an in-page
  // navigation. A page with a new `zoomKey` gets its saved level. A page
  // with the same key gets the current level again, because a new document
  // can start at the default level.
  protected updateZoomForPage(url: string): void {
    const key = zoomKey(this.profile, url);
    this.zoomUrl = url;
    if (key === this.pageZoomKey) {
      this.applyZoom();
      return;
    }
    this.pageZoomKey = key;
    if (key === undefined) {
      this.setZoomLevel(100);
      return;
    }
    browserApi()
      .getZoom(this.profile, url)
      .then((percent) => {
        // Ignore a level that comes after the next navigation.
        if (this.pageZoomKey === key) {
          this.setZoomLevel(percent);
        }
      })
      .catch(() => undefined);
  }

  // Saves the new level. The main process sends it back to all tabs with
  // the same profile and host (`zoomChanged`). A page with no host has no
  // zoom.
  protected changeZoom(percent: number): void {
    if (this.pageZoomKey === undefined || this.zoomUrl === undefined) {
      return;
    }
    browserApi()
      .setZoom(this.profile, this.zoomUrl, percent)
      .catch((error) => this.showMessage(String(error)));
  }

  protected setZoomLevel(percent: number): void {
    this.zoomPercent = percent;
    this.zoomButton.textContent = `${percent}%`;
    this.zoomButton.hidden = percent === 100;
    this.applyZoom();
  }

  protected applyZoom(): void {
    if (this.webview && this.webviewReady) {
      this.webview.setZoomFactor(this.zoomPercent / 100);
    }
  }

  protected onCertificateError(event: CertificateErrorEvent): void {
    // The event can come before `dom-ready` (for example for the `src` of a
    // restored tab), so compare with the id of the current guest page.
    if (event.webContentsId !== this.currentGuestId()) {
      return;
    }
    if (isLocalCertificateHost(event.host)) {
      this.showError(
        `The certificate of ${event.host} is not trusted (${event.error}).`,
        "Continue anyway",
        () => this.continueWithCertificate(event),
      );
    } else {
      this.showError(
        `The certificate of ${event.host} is not trusted (${event.error}). AI1 Browser does not open this page.`,
      );
    }
  }

  // The main process reloads the page after it accepts the certificate. A
  // load that did not commit yet has nothing to reload, so load the address
  // again here. A new load replaces the reload.
  protected async continueWithCertificate(event: CertificateErrorEvent): Promise<void> {
    await browserApi().acceptCertificate(event.webContentsId, event.host);
    this.navigate(event.url);
  }

  // The id of the page of the `<webview>`, or `undefined` before Electron
  // attached the page.
  protected currentGuestId(): number | undefined {
    try {
      return this.webview?.getWebContentsId();
    } catch {
      return undefined;
    }
  }

  protected showMessage(text: string | undefined): void {
    this.message.textContent = text ?? "";
    this.message.hidden = text === undefined;
  }

  protected showError(text: string, actionLabel?: string, action?: () => unknown): void {
    this.setPageTitle("Cannot open page");
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    this.errorPanel.replaceChildren(paragraph);
    if (actionLabel && action) {
      const button = document.createElement("button");
      button.className =
        actionLabel === "Continue anyway"
          ? "ai1-browser-continue theia-button secondary"
          : "ai1-browser-retry theia-button";
      button.textContent = actionLabel;
      button.addEventListener("click", () => {
        this.hideError();
        void action();
      });
      this.errorPanel.appendChild(button);
    }
    this.errorPanel.hidden = false;
  }

  protected hideError(): void {
    this.errorPanel.hidden = true;
  }
}
