import { AIActivationService } from "@theia/ai-core/lib/browser/ai-activation-service";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceContribution } from "@theia/core/lib/common/preferences/preference-schema";
import { ContainerModule } from "@theia/core/shared/inversify";
import { PreferenceLayoutProvider } from "@theia/preferences/lib/browser/util/preference-layout";
import { AiFeaturesOffService } from "./ai-features-off-service";
import { AiFreeLayoutProvider } from "./ai-free-layout-provider";
import { DefaultPreferencesContribution } from "./default-preferences-contribution";
import { HideAiPlaceholderContribution } from "./hide-ai-placeholder-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ShellLayoutContribution);

  bind(DefaultPreferencesContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(DefaultPreferencesContribution);

  bind(HideAiPlaceholderContribution).toSelf().inSingletonScope();
  bind(PreferenceContribution).toService(HideAiPlaceholderContribution);

  bind(AiFreeLayoutProvider).toSelf().inSingletonScope();
  rebind(PreferenceLayoutProvider).toService(AiFreeLayoutProvider);

  // The ai-core module already binds FrontendApplicationContribution to the
  // AIActivationService symbol. After the rebind, Theia calls initialize() of
  // the new service. A second contribution binding is not necessary.
  bind(AiFeaturesOffService).toSelf().inSingletonScope();
  rebind(AIActivationService).toService(AiFeaturesOffService);
});
