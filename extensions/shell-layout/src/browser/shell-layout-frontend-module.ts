import { AIActivationService } from "@theia/ai-core/lib/browser/ai-activation-service";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ContainerModule } from "@theia/core/shared/inversify";
import { AiFeaturesOffService } from "./ai-features-off-service";
import { DefaultPreferencesContribution } from "./default-preferences-contribution";
import { ShellLayoutContribution } from "./shell-layout-contribution";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(ShellLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ShellLayoutContribution);

  bind(DefaultPreferencesContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(DefaultPreferencesContribution);

  // The ai-core module already binds FrontendApplicationContribution to the
  // AIActivationService symbol. After the rebind, Theia calls initialize() of
  // the new service. A second contribution binding is not necessary.
  bind(AiFeaturesOffService).toSelf().inSingletonScope();
  rebind(AIActivationService).toService(AiFeaturesOffService);
});
