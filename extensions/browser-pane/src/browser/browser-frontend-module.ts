import {
  bindViewContribution,
  FrontendApplicationContribution,
  OpenHandler,
  WidgetFactory,
} from "@theia/core/lib/browser";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { TabBarToolbarContribution } from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { CommandContribution } from "@theia/core/lib/common";
import { PreferenceContribution } from "@theia/core/lib/common/preferences/preference-schema";
import { ContainerModule } from "@theia/core/shared/inversify";
import { PORTS_SERVICE_PATH, PortsService } from "../common/ports-protocol";
import { AgentContribution } from "./agent-contribution";
import { BrowserContribution } from "./browser-contribution";
import { BrowserOpenHandler } from "./browser-open-handler";
import { BrowserPreferenceContribution } from "./browser-preferences";
import { BrowserTabs } from "./browser-tabs";
import { BrowserWidget, BrowserWidgetOptions } from "./browser-widget";
import { PortsContribution } from "./ports-contribution";
import { PortsWidget } from "./ports-widget";
import { ShiftTracker } from "./shift-tracker";
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
  bind(AgentContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AgentContribution);
  bind(CommandContribution).toService(AgentContribution);
  bind(BrowserPreferenceContribution).toSelf().inSingletonScope();
  bind(PreferenceContribution).toService(BrowserPreferenceContribution);
  bind(ShiftTracker).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ShiftTracker);
  bind(BrowserOpenHandler).toSelf().inSingletonScope();
  bind(OpenHandler).toService(BrowserOpenHandler);
  bind(PortsService)
    .toDynamicValue((context) =>
      ServiceConnectionProvider.createProxy<PortsService>(context.container, PORTS_SERVICE_PATH),
    )
    .inSingletonScope();
  // Not a singleton: Theia disposes a closed view, so each open needs a new
  // widget.
  bind(PortsWidget).toSelf();
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: PortsWidget.ID,
      createWidget: () => context.container.get(PortsWidget),
    }))
    .inSingletonScope();
  bindViewContribution(bind, PortsContribution);
  bind(FrontendApplicationContribution).toService(PortsContribution);
  bind(TabBarToolbarContribution).toService(PortsContribution);
});
