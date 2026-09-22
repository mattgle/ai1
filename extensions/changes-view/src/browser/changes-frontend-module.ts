import "../../src/browser/style/changes.css";

import {
  bindViewContribution,
  createTreeContainer,
  FrontendApplicationContribution,
  WidgetFactory,
} from "@theia/core/lib/browser";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { TabBarToolbarContribution } from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { ResourceResolver } from "@theia/core/lib/common/resource";
import { ContainerModule, interfaces } from "@theia/core/shared/inversify";
import { CHANGES_SERVICE_PATH, ChangesService } from "../common/changes-protocol";
import { ChangesContribution } from "./changes-contribution";
import { ChangesWidget } from "./changes-widget";
import { HeadResourceResolver } from "./head-resource-resolver";

function createChangesWidget(parent: interfaces.Container): ChangesWidget {
  const child = createTreeContainer(parent, {
    props: { search: false, multiSelect: false, virtualized: true },
    widget: ChangesWidget,
  });
  return child.get(ChangesWidget);
}

export default new ContainerModule((bind) => {
  bind(ChangesService)
    .toDynamicValue((context) =>
      ServiceConnectionProvider.createProxy<ChangesService>(context.container, CHANGES_SERVICE_PATH),
    )
    .inSingletonScope();

  bind(HeadResourceResolver).toSelf().inSingletonScope();
  bind(ResourceResolver).toService(HeadResourceResolver);

  bind(ChangesWidget).toDynamicValue((context) => createChangesWidget(context.container));
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: ChangesWidget.ID,
      createWidget: () => context.container.get(ChangesWidget),
    }))
    .inSingletonScope();

  bindViewContribution(bind, ChangesContribution);
  bind(FrontendApplicationContribution).toService(ChangesContribution);
  bind(TabBarToolbarContribution).toService(ChangesContribution);
});
