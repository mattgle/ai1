import { ApplicationShell, Widget, WidgetManager } from "@theia/core/lib/browser";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import { ClosedTab, ClosedTabs } from "../common/closed-tabs";
import { INITIAL_PROFILES, Profile } from "../common/profiles";
import { newTabId } from "../common/tab-id";
import { browserApi } from "./browser-api";
import { BrowserWidget, BrowserWidgetOptions } from "./browser-widget";

@injectable()
export class BrowserTabs {
  @inject(WidgetManager)
  protected readonly widgets!: WidgetManager;

  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  protected profileList: Profile[] = INITIAL_PROFILES;
  protected counter = 0;
  protected readonly closedTabs = new ClosedTabs();

  // Each new browser widget gets the profile list before it is attached: a
  // tab from `open`, and also a tab that Theia restores from the saved
  // layout. It also gets the closed-tab list, so it can push itself when
  // the owner closes it and can reopen the last closed tab for its
  // shortcut.
  @postConstruct()
  protected init(): void {
    this.widgets.onDidCreateWidget(({ factoryId, widget }) => {
      if (factoryId === BrowserWidget.FACTORY_ID) {
        const browserWidget = widget as BrowserWidget;
        browserWidget.setProfiles(this.profileList);
        browserWidget.setClosedTabsHandle(this);
      }
    });
  }

  // Pushes a closed tab to the list. `BrowserWidget.onCloseRequest` calls
  // this. It does not call this for a tab with a connected agent, or for a
  // tab with no address (`about:blank`).
  pushClosed(tab: ClosedTab): void {
    this.closedTabs.push(tab);
  }

  // Reopens the last closed tab at its old place (next to the tab of its
  // `previousTabId`, when that tab is still open), with its old profile and
  // viewport. Does nothing when the list is empty.
  async reopenClosed(): Promise<BrowserWidget | undefined> {
    const closed = this.closedTabs.pop();
    if (!closed) {
      return undefined;
    }
    const ref = closed.previousTabId ? this.byTabId(closed.previousTabId) : undefined;
    const widget = await this.open(closed.url, closed.profileId, { ref });
    widget.applyViewportChoice(closed.viewport);
    return widget;
  }

  // Native webviews need a selected tab to render in the current design.
  async open(
    url: string,
    profileId: string,
    placement: { ref?: Widget; activate?: boolean } = {},
  ): Promise<BrowserWidget> {
    const options: BrowserWidgetOptions = { tabId: newTabId(Date.now(), this.counter++), url, profileId };
    const widget = await this.widgets.getOrCreateWidget<BrowserWidget>(BrowserWidget.FACTORY_ID, options);
    // A new tab goes next to the current tab of the main area. The current
    // widget can also be in a side or bottom panel (for example a terminal).
    const anchor = placement.ref ?? this.shell.currentWidget;
    const inMainArea = anchor !== undefined && anchor.isAttached && this.shell.getAreaFor(anchor) === "main";
    await this.shell.addWidget(
      widget,
      inMainArea ? { area: "main", mode: "tab-after", ref: anchor } : { area: "main" },
    );
    if (placement.activate === false) {
      await this.shell.revealWidget(widget.id);
    } else {
      await this.shell.activateWidget(widget.id);
    }
    return widget;
  }

  all(): BrowserWidget[] {
    return this.widgets.getWidgets(BrowserWidget.FACTORY_ID) as BrowserWidget[];
  }

  byTabId(tabId: string): BrowserWidget | undefined {
    return this.all().find((widget) => widget.tabId === tabId);
  }

  profiles(): Profile[] {
    return this.profileList;
  }

  async refreshProfiles(): Promise<void> {
    this.applyProfiles(await browserApi().listProfiles());
  }

  applyProfiles(profiles: Profile[]): void {
    this.profileList = profiles;
    for (const widget of this.all()) {
      widget.setProfiles(profiles);
    }
  }
}
