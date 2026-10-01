import { AIActivationService } from "@theia/ai-core/lib/browser/ai-activation-service";
import { FrontendApplicationContribution, KeybindingContribution } from "@theia/core/lib/browser";
import { CommandContribution } from "@theia/core/lib/common";
import { PreferenceContribution } from "@theia/core/lib/common/preferences/preference-schema";
import { ContainerModule } from "@theia/core/shared/inversify";
import { PreferenceLayoutProvider } from "@theia/preferences/lib/browser/util/preference-layout";
import { AiCommandsOffContribution } from "./ai-commands-off-contribution";
import { AiFeaturesOffService } from "./ai-features-off-service";
import { AiFreeLayoutProvider } from "./ai-free-layout-provider";
import { HideAiPlaceholderContribution } from "./hide-ai-placeholder-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";
import { TabNavigationContribution } from "./tab-navigation";
import { PluginCustomEditorRegistry } from "@theia/plugin-ext/lib/main/browser/custom-editors/plugin-custom-editor-registry";
import { ImageEditorRegistry } from "./image-editor-registry";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  rebind(PluginCustomEditorRegistry).to(ImageEditorRegistry).inSingletonScope();
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
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
