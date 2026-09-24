import { BaseWidget, StatefulWidget } from "@theia/core/lib/browser";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import type { WebviewTag } from "electron";
import { normalizeAddress } from "../common/address";
import { CertificateErrorEvent } from "../common/browser-ipc";
import { isLocalCertificateHost } from "../common/guest-policy";
import { DEFAULT_PROFILE_ID, partitionFor, Profile } from "../common/profiles";
import { browserApi } from "./browser-api";

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

  protected url = "about:blank";
  protected profile = DEFAULT_PROFILE_ID;
  protected profileList: Profile[] = [];
  protected webview: WebviewTag | undefined;
  protected registeredGuestId: number | undefined;
  // The methods of a `<webview>` work only after its first `dom-ready`
  // event. Until then, `navigate` keeps the address in `pendingUrl`.
  protected webviewReady = false;
  protected pendingUrl: string | undefined;
  protected readonly toolbar = document.createElement("div");
  protected readonly backButton = document.createElement("button");
  protected readonly forwardButton = document.createElement("button");
  protected readonly reloadButton = document.createElement("button");
  protected readonly addressInput = document.createElement("input");
  protected readonly profileSelect = document.createElement("select");
  protected readonly devToolsButton = document.createElement("button");
  protected readonly message = document.createElement("div");
  protected readonly viewport = document.createElement("div");
  protected readonly errorPanel = document.createElement("div");

  get tabId(): string {
    return this.options.tabId;
  }

  get profileId(): string {
    return this.profile;
  }

  get currentUrl(): string {
    return this.url;
  }

  @postConstruct()
  protected init(): void {
    this.id = `${BrowserWidget.FACTORY_ID}:${this.options.tabId}`;
    this.url = this.options.url;
    this.profile = this.options.profileId;
    this.title.label = "New Tab";
    this.title.caption = this.url;
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
    this.node.append(this.toolbar, this.message, this.viewport);
    this.toDispose.push({
      dispose: browserApi().onCertificateError((event) => this.onCertificateError(event)),
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

  setAgentMark(isAgent: boolean, connected: boolean): void {
    this.title.className = [
      isAgent ? "ai1-browser-agent-tab" : "",
      isAgent && connected ? "ai1-browser-agent-connected" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");
    this.title.caption = isAgent
      ? `${this.url} (agent tab${connected ? ", agent connected" : ""})`
      : this.url;
  }

  protected switchProfile(profileId: string): void {
    if (profileId === this.profile && this.webview) {
      return;
    }
    this.profile = profileId;
    this.profileSelect.value = profileId;
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
    this.profileSelect.className = "ai1-browser-profile theia-select";
    this.profileSelect.title = "Profile of this tab";
    this.profileSelect.addEventListener("change", () => this.switchProfile(this.profileSelect.value));
    this.toolbar.append(
      this.backButton,
      this.forwardButton,
      this.reloadButton,
      this.addressInput,
      this.profileSelect,
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
    webview.addEventListener("did-navigate", (event) => this.onNavigated(event.url));
    webview.addEventListener("did-navigate-in-page", (event) => {
      if (event.isMainFrame) {
        this.onNavigated(event.url);
      }
    });
    webview.addEventListener("page-title-updated", (event) => {
      this.title.label = event.title || this.url;
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
    this.viewport.insertBefore(webview, this.errorPanel);
  }

  protected onDomReady(webview: WebviewTag): void {
    this.webviewReady = true;
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
    this.title.caption = url;
    this.backButton.disabled = !this.webview?.canGoBack();
    this.forwardButton.disabled = !this.webview?.canGoForward();
    this.hideError();
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
    this.title.label = "Cannot open page";
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
