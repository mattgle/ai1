import { FrontendApplicationContribution, WidgetFactory } from "@theia/core/lib/browser";
import { CommandContribution } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { BrowserContribution } from "./browser-contribution";
import { BrowserTabs } from "./browser-tabs";
import { BrowserWidget, BrowserWidgetOptions } from "./browser-widget";
import "../../src/browser/style/browser.css";

export default new ContainerModule((bind) => {
  bind(BrowserTabs).toSelf().inSingletonScope();
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: BrowserWidget.FACTORY_ID,
      createWidget: (options: BrowserWidgetOptions) => {
        const child = context.container.createChild();
        child.bind(BrowserWidgetOptions).toConstantValue(options);
        child.bind(BrowserWidget).toSelf();
        return child.get(BrowserWidget);
      },
    }))
    .inSingletonScope();
  bind(BrowserContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(BrowserContribution);
  bind(FrontendApplicationContribution).toService(BrowserContribution);
});
