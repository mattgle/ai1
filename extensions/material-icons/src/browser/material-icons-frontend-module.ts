import { IconThemeContribution } from "@theia/core/lib/browser/icon-theme-contribution";
import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MaterialIconTheme } from "./material-icon-theme";

export default new ContainerModule((bind) => {
  bind(MaterialIconTheme).toSelf().inSingletonScope();
  bind(IconThemeContribution).toService(MaterialIconTheme);
  bind(LabelProviderContribution).toService(MaterialIconTheme);
});
