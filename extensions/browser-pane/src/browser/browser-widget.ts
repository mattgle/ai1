import { ApplicationShell, BaseWidget, QuickInputService, StatefulWidget } from "@theia/core/lib/browser";
import { ContextKeyService } from "@theia/core/lib/browser/context-key-service";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import type { WebviewTag } from "electron";
import { AgentsService, SessionSummary } from "ai1-agents";
import { normalizeAddress } from "../common/address";
import { AgentTabState, CertificateErrorEvent } from "../common/browser-ipc";
import { ClosedTab } from "../common/closed-tabs";
import { isLocalCertificateHost } from "../common/guest-policy";
import { DesignSelection } from "../common/design-selection";
import { DEFAULT_PROFILE_ID, partitionFor, Profile } from "../common/profiles";
import { BrowserShortcut } from "../common/shortcuts";
import { resolveViewport, validateCustomSize, VIEWPORT_PRESETS, ViewportChoice } from "../common/viewport";
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

// The parts of `BrowserTabs` that a browser widget uses to keep the shared
// list of closed tabs. This type avoids a circular import between this file
// and `browser-tabs.ts`, which owns the list. `BrowserTabs` gives its own
// instance to each widget after it creates it.
export interface ClosedTabsHandle {
  pushClosed(tab: ClosedTab): void;
  reopenClosed(): Promise<BrowserWidget | undefined>;
}

interface BrowserTabState {
  url: string;
  profileId: string;
  viewport?: ViewportChoice;
}

// One entry of the viewport menu and of the command "Browser: Set
// Viewport…".
export interface ViewportEntry {
  id: string;
  label: string;
  checked: boolean;
  enabled: boolean;
}

interface BrowserAnnotation {
  selection: DesignSelection;
  comment: string;
}

const VIEWPORT_OFF: ViewportChoice = { kind: "off" };
const OFF_LABEL = "Responsive (off)";
const PRESET_ENTRY = "preset:";

// One browser tab: a toolbar and one `<webview>`. The `<webview>` is made
// once for each profile and never gets a new parent element (a new parent
// loads the page again). A change of profile makes a new `<webview>`,
// because a partition cannot change after the first navigation.
@injectable()
export class BrowserWidget extends BaseWidget implements StatefulWidget {
  static readonly FACTORY_ID = "ai1-browser";

  @inject(BrowserWidgetOptions)
  protected readonly options!: BrowserWidgetOptions;

  @inject(AgentsService)
  protected readonly agents!: AgentsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(ContextKeyService)
  protected readonly contextKeys!: ContextKeyService;

  @inject(QuickInputService)
  protected readonly quickInput!: QuickInputService;

  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

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
  // The viewport size of the tab. The main process has it for the guest
  // `viewportGuestId` (after its registration).
  protected viewportChoice: ViewportChoice = VIEWPORT_OFF;
  protected viewportGuestId: number | undefined;
  // The error text of the last viewport change that failed, while the
  // message shows it.
  protected viewportError: string | undefined;
  // Set once by `BrowserTabs` after it creates this widget. It pushes this
  // tab to the closed list when the owner closes it, and reopens the last
  // closed tab for the shortcut (see `onCloseRequest` and `runShortcut`).
  protected closedTabsHandle: ClosedTabsHandle | undefined;
  protected readonly viewportButton = document.createElement("button");
  protected readonly viewportMenu = document.createElement("div");
  protected readonly viewportLabel = document.createElement("div");
  protected readonly closeViewportMenuOnClick = (event: MouseEvent): void => {
    if (!this.viewportMenu.contains(event.target as Node) && event.target !== this.viewportButton) {
      this.closeViewportMenu();
    }
  };
  protected readonly toolbar = document.createElement("div");
  protected readonly backButton = document.createElement("button");
  protected readonly forwardButton = document.createElement("button");
  protected readonly reloadButton = document.createElement("button");
  protected readonly addressInput = document.createElement("input");
  protected readonly zoomButton = document.createElement("button");
  protected readonly profileSelect = document.createElement("select");
  protected readonly agentButton = document.createElement("button");
  protected readonly devToolsButton = document.createElement("button");
  protected readonly inspectButton = document.createElement("button");
  protected readonly sendFeedbackButton = document.createElement("button");
  protected readonly copyFeedbackButton = document.createElement("button");
  protected readonly manageFeedbackButton = document.createElement("button");
  protected readonly clearFeedbackButton = document.createElement("button");
  protected readonly inspectOverlay = document.createElement("div");
  protected inspecting = false;
  protected annotations: BrowserAnnotation[] = [];
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
    this.viewportLabel.className = "ai1-browser-viewport-label";
    this.viewportLabel.hidden = true;
    this.inspectOverlay.hidden = true;
    this.inspectOverlay.className = "ai1-browser-inspect-overlay";
    this.inspectOverlay.tabIndex = 0;
    this.inspectOverlay.setAttribute("aria-label", "Select an element on the page. Press Escape to cancel.");
    this.inspectOverlay.addEventListener("click", (event) => void this.pickElement(event));
    this.viewport.append(this.viewportLabel, this.errorPanel, this.inspectOverlay);
    this.node.append(this.toolbar, this.findBar.node, this.message, this.viewport);
    const tabContext = this.contextKeys.createScoped(this.node);
    tabContext.createKey(BROWSER_FOCUS_CONTEXT, true);
    // The find bar has its own scope, so the Esc keybinding works only in
    // the find bar. Only the nearest scope gives local keys, so this scope
    // also holds the key of the tab.
    const findContext = tabContext.createScoped(this.findBar.node);
    findContext.createKey(BROWSER_FOCUS_CONTEXT, true);
    findContext.createKey(BROWSER_FIND_FOCUS_CONTEXT, true);
    // `toDispose` disposes in the reverse order, so the child scope goes
    // first. When the parent goes first, Monaco does not remove the context
    // of the child scope, and one context stays for each closed tab.
    this.toDispose.push(tabContext);
    this.toDispose.push(findContext);
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
    this.toDispose.push({ dispose: () => this.closeViewportMenu() });
    this.updateViewportLayout();
  }

  storeState(): BrowserTabState {
    return { url: this.url, profileId: this.profile, viewport: this.viewportChoice };
  }

  restoreState(oldState: object): void {
    const state = oldState as Partial<BrowserTabState>;
    if (typeof state.url === "string") {
      this.url = state.url;
    }
    if (typeof state.profileId === "string") {
      this.profile = state.profileId;
    }
    // The widget sets the size on the page after the first `dom-ready`
    // (see `onGuestRegistered`).
    if (state.viewport !== undefined && resolveViewport(state.viewport) !== undefined) {
      this.viewportChoice = state.viewport;
      this.updateViewportLayout();
    }
    // Theia calls this after the widget got the profile list, so check the
    // restored profile again: it can be gone.
    if (this.profileList.length > 0) {
      this.setProfiles(this.profileList);
    }
  }

  // `BrowserTabs` calls this once, right after it creates the widget.
  setClosedTabsHandle(handle: ClosedTabsHandle): void {
    this.closedTabsHandle = handle;
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
      case "reopenClosedTab":
        void this.closedTabsHandle?.reopenClosed();
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
    this.viewportButton.disabled = connected;
    if (connected) {
      // The main process cleared the size before the agent got the page.
      this.closeViewportMenu();
      this.viewportChoice = VIEWPORT_OFF;
      this.updateViewportLayout();
    }
    this.title.className = [
      waiting ? "ai1-browser-agent-waiting" : "",
      connected ? "ai1-browser-agent-tab ai1-browser-agent-connected" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");
    this.updateLabel();
    this.updateCaption();
  }

  // Theia sends the close request only when the owner closes the tab, not
  // at shutdown and not on a layout restore (those call `dispose` without
  // it). Push the tab to the closed list before `super` detaches it from
  // its tab bar, so the tab bar still holds its left neighbor.
  protected override onCloseRequest(msg: Parameters<BaseWidget["onCloseRequest"]>[0]): void {
    if (!this.agentConnected && this.url !== "about:blank") {
      this.closedTabsHandle?.pushClosed({
        url: this.url,
        profileId: this.profile,
        viewport: this.viewportChoice,
        previousTabId: this.leftNeighborTabId(),
      });
    }
    super.onCloseRequest(msg);
  }

  // The tab id of the browser tab to the left of this one in the same tab
  // bar, or `undefined` when there is none.
  protected leftNeighborTabId(): string | undefined {
    const tabBar = this.shell.getTabBarFor(this);
    if (!tabBar) {
      return undefined;
    }
    const index = tabBar.titles.indexOf(this.title);
    if (index <= 0) {
      return undefined;
    }
    const neighbor = tabBar.titles[index - 1].owner;
    return neighbor instanceof BrowserWidget ? neighbor.tabId : undefined;
  }

  override dispose(): void {
    this.stopDesignMode();
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
    this.stopDesignMode();
    this.annotations = [];
    this.updateFeedbackControls();
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
      this.stopDesignMode();
      this.annotations = [];
      this.updateFeedbackControls();
      this.hideError();
      this.webview?.reload();
    });
    button(this.agentButton, "codicon-hubot", "Give this tab to the agent", () => {
      void browserApi().giveToAgent(this.tabId);
    });
    this.agentButton.classList.add("ai1-browser-give-to-agent");
    button(this.viewportButton, "codicon-device-mobile", OFF_LABEL, () => this.toggleViewportMenu());
    this.viewportButton.classList.add("ai1-browser-viewport-button");
    this.viewportMenu.className = "ai1-browser-viewport-menu";
    this.viewportMenu.hidden = true;
    this.viewportMenu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeViewportMenu();
        this.viewportButton.focus();
      }
    });
    button(this.devToolsButton, "codicon-tools", "Open DevTools", () => this.webview?.openDevTools());
    button(this.inspectButton, "codicon-inspect", "Select an element and add feedback", () =>
      this.toggleDesignMode(),
    );
    this.inspectButton.classList.add("ai1-browser-inspect-button");
    button(
      this.sendFeedbackButton,
      "codicon-send",
      "Send browser feedback to an agent",
      () => void this.sendFeedback(),
    );
    this.sendFeedbackButton.hidden = true;
    button(this.copyFeedbackButton, "codicon-copy", "Copy browser feedback", () => void this.copyFeedback());
    this.copyFeedbackButton.hidden = true;
    button(
      this.manageFeedbackButton,
      "codicon-edit",
      "Edit or remove browser feedback",
      () => void this.manageFeedback(),
    );
    this.manageFeedbackButton.hidden = true;
    button(this.clearFeedbackButton, "codicon-trash", "Clear browser feedback", () => this.clearFeedback());
    this.clearFeedbackButton.hidden = true;
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
      this.viewportButton,
      this.inspectButton,
      this.sendFeedbackButton,
      this.copyFeedbackButton,
      this.manageFeedbackButton,
      this.clearFeedbackButton,
      this.agentButton,
      this.devToolsButton,
      this.viewportMenu,
    );
  }

  protected toggleDesignMode(): void {
    if (this.inspecting) {
      this.stopDesignMode();
      return;
    }
    if (!this.webview || !this.webviewReady || this.agentConnected) {
      this.showMessage("Select an element after the page loads and the agent disconnects.");
      return;
    }
    const hostRect = this.viewport.getBoundingClientRect();
    const pageRect = this.webview.getBoundingClientRect();
    this.inspectOverlay.style.left = `${pageRect.left - hostRect.left}px`;
    this.inspectOverlay.style.top = `${pageRect.top - hostRect.top}px`;
    this.inspectOverlay.style.width = `${pageRect.width}px`;
    this.inspectOverlay.style.height = `${pageRect.height}px`;
    this.inspecting = true;
    this.inspectOverlay.hidden = false;
    this.inspectButton.classList.add("ai1-browser-inspect-active");
    this.showMessage("Click an element to add feedback. Press Escape to cancel.");
    document.addEventListener("keydown", this.onDesignModeKeyDown, true);
    this.inspectOverlay.focus();
  }

  protected readonly onDesignModeKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.inspecting) {
      event.preventDefault();
      event.stopPropagation();
      this.stopDesignMode();
      this.showMessage(undefined);
    }
  };

  protected stopDesignMode(): void {
    this.inspecting = false;
    this.inspectOverlay.hidden = true;
    this.inspectButton.classList.remove("ai1-browser-inspect-active");
    document.removeEventListener("keydown", this.onDesignModeKeyDown, true);
  }

  protected async pickElement(event: MouseEvent): Promise<void> {
    if (!this.inspecting) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const guestId = this.currentGuestId();
    const webview = this.webview;
    if (guestId === undefined || !webview) {
      this.stopDesignMode();
      return;
    }
    const bounds = webview.getBoundingClientRect();
    const selection = await browserApi()
      .inspectElement(guestId, event.clientX - bounds.left, event.clientY - bounds.top)
      .catch(() => undefined);
    this.stopDesignMode();
    if (!selection) {
      this.showMessage("AI1 could not read that element. Select another one.");
      return;
    }
    if (this.annotations.length >= 10) {
      this.showMessage("A page can have up to 10 feedback items.");
      return;
    }
    const markedSelection = await this.openScreenshotMarkup(selection);
    if (!markedSelection) {
      return;
    }
    const comment = await this.quickInput.input({
      prompt: `Feedback for <${selection.tagName}>`,
      value: "",
    });
    if (comment === undefined || comment.trim() === "") {
      this.showMessage(undefined);
      return;
    }
    this.annotations.push({ selection: markedSelection, comment: comment.trim().slice(0, 2000) });
    this.updateFeedbackControls();
    this.showMessage(`Added feedback for <${selection.tagName}>.`);
  }

  protected async openScreenshotMarkup(selection: DesignSelection): Promise<DesignSelection | undefined> {
    if (!selection.screenshot) {
      return selection;
    }
    const dialog = document.createElement("section");
    dialog.className = "ai1-browser-markup-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Mark up the selected element screenshot");
    const heading = document.createElement("p");
    heading.textContent =
      "Draw on the screenshot. Use Markup to attach your drawing, or Skip to keep the original.";
    const canvas = document.createElement("canvas");
    canvas.className = "ai1-browser-markup-canvas";
    const actions = document.createElement("div");
    actions.className = "ai1-browser-markup-actions";
    const makeButton = (label: string): HTMLButtonElement => {
      const button = document.createElement("button");
      button.className = "theia-button secondary";
      button.textContent = label;
      actions.append(button);
      return button;
    };
    const markupButton = makeButton("Use markup");
    const skipButton = makeButton("Skip markup");
    const cancelButton = makeButton("Cancel selection");
    dialog.append(heading, canvas, actions);
    this.viewport.append(dialog);

    const image = new Image();
    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = selection.screenshot!;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      dialog.remove();
      return selection;
    }
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      dialog.remove();
      return selection;
    }
    context.drawImage(image, 0, 0);
    let drawing = false;
    let hasDrawing = false;
    const point = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };
    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      hasDrawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.strokeStyle = "#ff3158";
      context.lineWidth = Math.max(3, canvas.width / 120);
      context.lineCap = "round";
      context.lineJoin = "round";
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) {
        return;
      }
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
    });
    canvas.addEventListener("pointerup", () => {
      drawing = false;
    });
    canvas.addEventListener("pointercancel", () => {
      drawing = false;
    });

    return new Promise<DesignSelection | undefined>((resolve) => {
      const finish = (result: DesignSelection | undefined): void => {
        document.removeEventListener("keydown", onKeyDown, true);
        dialog.remove();
        resolve(result);
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(undefined);
        }
      };
      document.addEventListener("keydown", onKeyDown, true);
      markupButton.addEventListener("click", () =>
        finish({
          ...selection,
          screenshot: hasDrawing ? canvas.toDataURL("image/png") : selection.screenshot,
        }),
      );
      skipButton.addEventListener("click", () => finish(selection));
      cancelButton.addEventListener("click", () => finish(undefined));
      markupButton.focus();
    });
  }

  protected updateFeedbackControls(): void {
    const count = this.annotations.length;
    this.sendFeedbackButton.hidden = count === 0;
    this.copyFeedbackButton.hidden = count === 0;
    this.manageFeedbackButton.hidden = count === 0;
    this.clearFeedbackButton.hidden = count === 0;
    this.sendFeedbackButton.textContent = `Send feedback (${count})`;
    this.clearFeedbackButton.setAttribute("aria-label", `Clear ${count} browser feedback items`);
  }

  protected clearFeedback(): void {
    this.annotations = [];
    this.updateFeedbackControls();
    this.showMessage("Browser feedback cleared.");
  }

  protected feedbackText(): string {
    return this.annotations
      .map(({ selection, comment }, index) =>
        [
          `## Browser feedback ${index + 1}`,
          `Page: ${selection.pageTitle} (${selection.pageUrl})`,
          `Element: <${selection.tagName}>`,
          `Selector: ${selection.selector}`,
          `Text: ${selection.text}`,
          `Styles: ${JSON.stringify(selection.styles)}`,
          `HTML: ${selection.html}`,
          `Feedback: ${comment}`,
        ].join("\n"),
      )
      .join("\n\n");
  }

  protected async copyFeedback(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.feedbackText());
      this.showMessage("Browser feedback copied.");
    } catch {
      this.showMessage("AI1 could not copy browser feedback.");
    }
  }

  protected async manageFeedback(): Promise<void> {
    const entries = this.annotations.map((annotation, index) => ({
      label: `${index + 1}. <${annotation.selection.tagName}> ${annotation.selection.selector}`,
      description: annotation.comment,
      index,
    }));
    const choice = await this.quickInput.showQuickPick(entries, {
      placeholder: "Choose feedback to edit or remove",
    });
    if (!choice) {
      return;
    }
    const action = await this.quickInput.showQuickPick(
      [
        { label: "Edit comment", value: "edit" },
        { label: "Remove feedback", value: "remove" },
      ],
      { placeholder: "Choose an action" },
    );
    if (!action) {
      return;
    }
    if (action.value === "remove") {
      this.annotations.splice(choice.index, 1);
      this.updateFeedbackControls();
      return;
    }
    const annotation = this.annotations[choice.index];
    const comment = await this.quickInput.input({ prompt: "Edit feedback", value: annotation.comment });
    if (comment !== undefined && comment.trim()) {
      annotation.comment = comment.trim().slice(0, 2000);
    }
  }

  protected async sendFeedback(): Promise<void> {
    if (this.annotations.length === 0) {
      return;
    }
    try {
      const roots = await this.workspace.roots;
      const snapshot = await this.agents.load(roots.map((root) => root.resource.toString()));
      const choices = snapshot.groups.flatMap((group) =>
        group.sessions.map((session: SessionSummary) => ({
          label: session.title,
          description: `${group.name} · ${session.status}`,
          session,
        })),
      );
      if (choices.length === 0) {
        this.showMessage("There are no agent sessions in this workspace.");
        return;
      }
      const choice = await this.quickInput.showQuickPick(choices, { placeholder: "Choose an agent session" });
      if (!choice) {
        return;
      }
      const text = this.feedbackText();
      const files = this.annotations.flatMap(({ selection }, index) =>
        selection.screenshot
          ? [
              {
                uri: selection.screenshot,
                name: `browser-selection-${index + 1}.png`,
                description: selection.selector,
              },
            ]
          : [],
      );
      await this.agents.sendPrompt(choice.session.id, text, files);
      this.showMessage(`Browser feedback sent to ${choice.session.title}.`);
    } catch (error) {
      this.showMessage(
        `Could not send browser feedback: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    this.viewportGuestId = undefined;
    this.viewport.insertBefore(webview, this.errorPanel);
    this.updateViewportLayout();
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
      .then(() => this.onGuestRegistered(guestId))
      .catch((error) => this.showMessage(String(error)));
  }

  // A new guest (a new tab, a restored tab, or a profile change) gets the
  // viewport size of the tab.
  protected onGuestRegistered(guestId: number): void {
    if (guestId !== this.registeredGuestId) {
      return;
    }
    this.viewportGuestId = guestId;
    if (this.viewportChoice.kind !== "off" && !this.agentConnected) {
      void this.setViewport(this.viewportChoice);
    }
  }

  // The entries of the viewport menu, in the order of the spec.
  viewportEntries(): ViewportEntry[] {
    const choice = this.viewportChoice;
    const enabled = !this.agentConnected;
    return [
      { id: "off", label: OFF_LABEL, checked: choice.kind === "off", enabled },
      ...VIEWPORT_PRESETS.map((preset) => ({
        id: PRESET_ENTRY + preset.id,
        label: `${preset.label} (${preset.width} × ${preset.height})`,
        checked: choice.kind === "preset" && choice.id === preset.id,
        enabled,
      })),
      { id: "custom", label: "Custom…", checked: choice.kind === "custom", enabled },
      { id: "rotate", label: "Rotate", checked: false, enabled: enabled && choice.kind === "preset" },
    ];
  }

  // Sets the viewport choice of a reopened tab. Like `restoreState`, it
  // only sets the choice: the widget applies it to the page after its
  // first guest registration (see `onGuestRegistered`).
  applyViewportChoice(choice: ViewportChoice): void {
    if (resolveViewport(choice) !== undefined) {
      this.viewportChoice = choice;
      this.updateViewportLayout();
    }
  }

  async chooseViewportEntry(id: string): Promise<void> {
    const choice = this.viewportChoice;
    if (id === "off") {
      await this.setViewport(VIEWPORT_OFF);
    } else if (id.startsWith(PRESET_ENTRY)) {
      await this.setViewport({ kind: "preset", id: id.slice(PRESET_ENTRY.length), rotated: false });
    } else if (id === "custom") {
      const size = await this.askCustomSize();
      if (size) {
        await this.setViewport({ kind: "custom", ...size });
      }
    } else if (id === "rotate" && choice.kind === "preset") {
      await this.setViewport({ ...choice, rotated: !choice.rotated });
    }
  }

  protected async askCustomSize(): Promise<{ width: number; height: number } | undefined> {
    const current = resolveViewport(this.viewportChoice);
    const toNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));
    const widthText = await this.quickInput.input({
      prompt: "Width of the viewport in CSS pixels (200 to 4000)",
      value: String(current?.width ?? 1280),
      validateInput: async (text) => validateCustomSize(toNumber(text), 200),
    });
    if (widthText === undefined) {
      return undefined;
    }
    const width = toNumber(widthText);
    const heightText = await this.quickInput.input({
      prompt: "Height of the viewport in CSS pixels (200 to 4000)",
      value: String(current?.height ?? 800),
      validateInput: async (text) => validateCustomSize(width, toNumber(text)),
    });
    if (heightText === undefined) {
      return undefined;
    }
    const height = toNumber(heightText);
    return validateCustomSize(width, height) === undefined ? { width, height } : undefined;
  }

  // Sends the size to the main process when the guest is registered. Else
  // the widget keeps it and sends it after the registration.
  protected async setViewport(choice: ViewportChoice): Promise<void> {
    if (this.agentConnected) {
      return;
    }
    const guestId = this.viewportGuestId;
    if (guestId !== undefined) {
      let error: string | undefined;
      try {
        const result = await browserApi().setViewport(guestId, choice);
        error = result.ok ? undefined : result.error;
      } catch (thrown) {
        error = String(thrown);
      }
      // Ignore a result for an old guest. An agent that connected in the
      // meantime cleared the size (see `setAgentState`).
      if (guestId !== this.viewportGuestId || this.agentConnected) {
        return;
      }
      if (error !== undefined) {
        this.showMessage(error);
        this.viewportError = error;
        if (this.viewportChoice === choice) {
          // A saved size that cannot be set now.
          this.viewportChoice = VIEWPORT_OFF;
          this.updateViewportLayout();
        }
        return;
      }
    }
    if (this.viewportError !== undefined && this.message.textContent === this.viewportError) {
      this.showMessage(undefined);
    }
    this.viewportError = undefined;
    this.viewportChoice = choice;
    this.updateViewportLayout();
  }

  // With a size, the page has that CSS size, in the center of the tab, with
  // a label above it.
  protected updateViewportLayout(): void {
    const settings = resolveViewport(this.viewportChoice);
    this.viewport.classList.toggle("ai1-browser-emulated", settings !== undefined);
    this.viewportLabel.hidden = settings === undefined;
    this.viewportLabel.textContent = settings ? `${settings.width} × ${settings.height}` : "";
    if (this.webview) {
      this.webview.style.width = settings ? `${settings.width}px` : "";
      this.webview.style.height = settings ? `${settings.height}px` : "";
    }
    const label = this.viewportEntries().find((entry) => entry.checked)?.label ?? OFF_LABEL;
    const rotated = this.viewportChoice.kind === "preset" && this.viewportChoice.rotated ? ", rotated" : "";
    this.viewportButton.title = `Viewport: ${label}${rotated}`;
    this.viewportButton.classList.toggle("ai1-browser-viewport-active", settings !== undefined);
  }

  protected toggleViewportMenu(): void {
    if (this.viewportMenu.hidden) {
      this.openViewportMenu();
    } else {
      this.closeViewportMenu();
    }
  }

  protected openViewportMenu(): void {
    if (this.agentConnected) {
      return;
    }
    this.viewportMenu.replaceChildren(
      ...this.viewportEntries().map((entry) => {
        const item = document.createElement("button");
        item.className = "ai1-browser-viewport-item";
        item.disabled = !entry.enabled;
        item.dataset.entry = entry.id;
        const check = document.createElement("span");
        check.className = `codicon ${entry.checked ? "codicon-check" : "codicon-blank"}`;
        const text = document.createElement("span");
        text.textContent = entry.label;
        item.append(check, text);
        item.addEventListener("click", () => {
          this.closeViewportMenu();
          void this.chooseViewportEntry(entry.id);
        });
        return item;
      }),
    );
    this.viewportMenu.style.left = `${this.viewportButton.offsetLeft}px`;
    this.viewportMenu.hidden = false;
    document.addEventListener("mousedown", this.closeViewportMenuOnClick, true);
    this.viewportMenu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  protected closeViewportMenu(): void {
    this.viewportMenu.hidden = true;
    document.removeEventListener("mousedown", this.closeViewportMenuOnClick, true);
  }

  protected onNavigated(url: string): void {
    // The first page of a new `<webview>` must not replace an address that
    // waits for `dom-ready`.
    if (this.pendingUrl !== undefined) {
      return;
    }
    if (this.url !== url) {
      this.stopDesignMode();
      this.annotations = [];
      this.updateFeedbackControls();
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
