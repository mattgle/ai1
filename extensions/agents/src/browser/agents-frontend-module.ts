import {
  bindViewContribution,
  createTreeContainer,
  FrontendApplicationContribution,
  KeybindingContribution,
  WidgetFactory,
} from "@theia/core/lib/browser";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { TabBarToolbarContribution } from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { PreferenceContribution } from "@theia/core/lib/common/preferences/preference-schema";
import { ContainerModule, interfaces } from "@theia/core/shared/inversify";
import { AGENTS_SERVICE_PATH, AgentsClient, AgentsService } from "../common/agents-protocol";
import { AgentsContribution } from "./agents-contribution";
import { CommandContribution } from "@theia/core/lib/common";
import { TerminalControls } from "./terminal-controls";
import { AgentsModel } from "./agents-model";
import { AgentsPreferenceContribution } from "./agents-preferences";
import { AgentsTerminals } from "./agents-terminals";
import { AgentsWidget } from "./agents-widget";
import { BlockedNotifier } from "./blocked-notifier";
import { TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { PersistentTerminalWidget } from "./persistent-terminal-widget";
import { TerminalThemeService } from "@theia/terminal/lib/browser/terminal-theme-service";
import { GhosttyTerminalTheme } from "./ghostty-terminal-theme";
import "../../src/browser/style/agents.css";
import "../../src/browser/style/terminal-appearance.css";

function createAgentsWidget(parent: interfaces.Container): AgentsWidget {
  const child = createTreeContainer(parent, {
    props: { search: false, multiSelect: false, virtualized: false },
    widget: AgentsWidget,
  });
  return child.get(AgentsWidget);
}

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  rebind(TerminalWidget).to(PersistentTerminalWidget).inTransientScope();
  rebind(TerminalThemeService).to(GhosttyTerminalTheme).inSingletonScope();
  bind(FrontendApplicationContribution).toService(TerminalThemeService);
  bind(TerminalControls).toSelf().inSingletonScope();
  bind(CommandContribution).toService(TerminalControls);
  bind(KeybindingContribution).toService(TerminalControls);
  bind(FrontendApplicationContribution).toService(TerminalControls);
  bind(AgentsModel).toSelf().inSingletonScope();
  bind(AgentsTerminals).toSelf().inSingletonScope();
  bind(AgentsService)
    .toDynamicValue((context) => {
      // The proxy's client forwards to the model. The model is resolved
      // lazily inside each forwarder, so there is no cycle at construction
      // time; the `AgentsService` interface has no `setClient` method.
      const forward: AgentsClient = {
        onSessionChanged: (summary) => context.container.get(AgentsModel).onSessionChanged(summary),
        onSessionRemoved: (id) => context.container.get(AgentsModel).onSessionRemoved(id),
        onConnectionChanged: (connected) => context.container.get(AgentsModel).onConnectionChanged(connected),
        onReloadRequested: () => context.container.get(AgentsModel).onReloadRequested(),
      };
      return ServiceConnectionProvider.createProxy<AgentsService>(
        context.container,
        AGENTS_SERVICE_PATH,
        forward,
      );
    })
    .inSingletonScope();

  bind(AgentsWidget).toDynamicValue((context) => createAgentsWidget(context.container));
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: AgentsWidget.ID,
      createWidget: () => context.container.get(AgentsWidget),
    }))
    .inSingletonScope();

  bindViewContribution(bind, AgentsContribution);
  bind(FrontendApplicationContribution).toService(AgentsContribution);
  bind(TabBarToolbarContribution).toService(AgentsContribution);

  bind(AgentsPreferenceContribution).toSelf().inSingletonScope();
  bind(PreferenceContribution).toService(AgentsPreferenceContribution);

  bind(BlockedNotifier).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(BlockedNotifier);

  // The Agents tab's badge uses Theia's own `BadgeService` and its always-
  // bound `TabBarBadgeDecorator` (`@theia/core/src/browser/badges`), so it
  // needs no `TabBarDecorator` of its own; see `AgentsContribution`.
});
