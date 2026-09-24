import { ApplicationShell, Widget, WidgetManager } from "@theia/core/lib/browser";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
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

  // Each new browser widget gets the profile list before it is attached: a
  // tab from `open`, and also a tab that Theia restores from the saved layout.
  @postConstruct()
  protected init(): void {
    this.widgets.onDidCreateWidget(({ factoryId, widget }) => {
      if (factoryId === BrowserWidget.FACTORY_ID) {
        (widget as BrowserWidget).setProfiles(this.profileList);
      }
    });
  }

  async open(url: string, profileId: string, ref?: Widget): Promise<BrowserWidget> {
    const options: BrowserWidgetOptions = { tabId: newTabId(Date.now(), this.counter++), url, profileId };
    const widget = await this.widgets.getOrCreateWidget<BrowserWidget>(BrowserWidget.FACTORY_ID, options);
    // A new tab goes next to the current tab of the main area. The current
    // widget can also be in a side or bottom panel (for example a terminal).
    const anchor = ref ?? this.shell.currentWidget;
    const inMainArea = anchor !== undefined && anchor.isAttached && this.shell.getAreaFor(anchor) === "main";
    await this.shell.addWidget(
      widget,
      inMainArea ? { area: "main", mode: "tab-after", ref: anchor } : { area: "main" },
    );
    await this.shell.activateWidget(widget.id);
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
