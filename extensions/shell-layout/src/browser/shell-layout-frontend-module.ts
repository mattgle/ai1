import { AIActivationService } from "@theia/ai-core/lib/browser/ai-activation-service";
import {
  FrontendApplicationContribution,
  KeybindingContribution,
  WidgetFactory,
} from "@theia/core/lib/browser";
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { PreferenceContribution } from "@theia/core/lib/common/preferences/preference-schema";
import { ContainerModule } from "@theia/core/shared/inversify";
import { PreferenceLayoutProvider } from "@theia/preferences/lib/browser/util/preference-layout";
import { AiCommandsOffContribution } from "./ai-commands-off-contribution";
import { AiFeaturesOffService } from "./ai-features-off-service";
import { AiFreeLayoutProvider } from "./ai-free-layout-provider";
import { HideAiPlaceholderContribution } from "./hide-ai-placeholder-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";
import { TabNavigationContribution } from "./tab-navigation";
import { ClosedTabBatchContribution } from "./closed-tab-batch-contribution";
import { PluginCustomEditorRegistry } from "@theia/plugin-ext/lib/main/browser/custom-editors/plugin-custom-editor-registry";
import { ImageEditorRegistry } from "./image-editor-registry";
import "../../src/browser/rounded-workspace.css";
import { ColorContribution } from "@theia/core/lib/browser/color-application-contribution";
import { WorkspaceColors } from "./workspace-colors";
import { WelcomeWidget } from "./welcome-widget";
import { WelcomeContribution } from "./welcome-contribution";
import { SectionShortcuts } from "./section-shortcuts";
import "../../src/browser/welcome.css";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(ClosedTabBatchContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(ClosedTabBatchContribution);
  bind(FrontendApplicationContribution).toService(ClosedTabBatchContribution);
  bind(SectionShortcuts).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(SectionShortcuts);
  bind(WelcomeWidget).toSelf();
  bind(WidgetFactory)
    .toDynamicValue((context) => ({
      id: WelcomeWidget.ID,
      createWidget: () => context.container.get(WelcomeWidget),
    }))
    .inSingletonScope();
  bind(WelcomeContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(WelcomeContribution);
  bind(MenuContribution).toService(WelcomeContribution);
  bind(FrontendApplicationContribution).toService(WelcomeContribution);
  bind(PreferenceContribution).toConstantValue({
    schema: {
      properties: {
        "ai1.welcome.startup": {
          type: "string",
          enum: ["firstStart", "always", "never"],
          default: "firstStart",
          description:
            "When to open the Welcome to AI1 tab. First start applies to this app profile, not each workspace.",
        },
        "ai1.welcome.completed": {
          type: "boolean",
          default: false,
          hidden: true,
          description: "The Welcome tab opens at least once in this app profile.",
        },
      },
    },
  });
  rebind(PluginCustomEditorRegistry).to(ImageEditorRegistry).inSingletonScope();
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
  bind(WorkspaceColors).toSelf().inSingletonScope();
  bind(ColorContribution).toService(WorkspaceColors);
  bind(FrontendApplicationContribution).toService(ShellLayoutContribution);

  bind(TabNavigationContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(TabNavigationContribution);
  bind(FrontendApplicationContribution).toService(TabNavigationContribution);
  bind(KeybindingContribution).toService(TabNavigationContribution);

  bind(HideAiPlaceholderContribution).toSelf().inSingletonScope();
  bind(PreferenceContribution).toService(HideAiPlaceholderContribution);

  bind(AiFreeLayoutProvider).toSelf().inSingletonScope();
  rebind(PreferenceLayoutProvider).toService(AiFreeLayoutProvider);

  // The ai-core module already binds FrontendApplicationContribution to the
  // AIActivationService symbol. After the rebind, Theia calls initialize() of
  // the new service. A second contribution binding is not necessary.
  bind(AiFeaturesOffService).toSelf().inSingletonScope();
  rebind(AIActivationService).toService(AiFeaturesOffService);

  bind(AiCommandsOffContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AiCommandsOffContribution);
});
