import { ApplicationShell, Widget, WidgetManager } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
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

  async open(url: string, profileId: string, ref?: Widget): Promise<BrowserWidget> {
    const options: BrowserWidgetOptions = { tabId: newTabId(Date.now(), this.counter++), url, profileId };
    const widget = await this.widgets.getOrCreateWidget<BrowserWidget>(BrowserWidget.FACTORY_ID, options);
    widget.setProfiles(this.profileList);
    const anchor = ref ?? this.shell.currentWidget;
    await this.shell.addWidget(
      widget,
      anchor && anchor.isAttached ? { area: "main", mode: "tab-after", ref: anchor } : { area: "main" },
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
