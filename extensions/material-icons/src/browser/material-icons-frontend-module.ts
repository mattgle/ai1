import { IconThemeContribution } from "@theia/core/lib/browser/icon-theme-contribution";
import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MATERIAL_ICONS_SERVICE_PATH, MaterialIconsService } from "../common/material-icons-protocol";
import { MaterialIconTheme } from "./material-icon-theme";
import { DiffFileIconLabelProvider } from "./diff-file-icon-label-provider";

export default new ContainerModule((bind) => {
  bind(MaterialIconsService)
    .toDynamicValue((context) =>
      ServiceConnectionProvider.createProxy<MaterialIconsService>(
        context.container,
        MATERIAL_ICONS_SERVICE_PATH,
      ),
    )
    .inSingletonScope();

  bind(MaterialIconTheme).toSelf().inSingletonScope();
  bind(IconThemeContribution).toService(MaterialIconTheme);
  bind(LabelProviderContribution).toService(MaterialIconTheme);
  bind(LabelProviderContribution).to(DiffFileIconLabelProvider).inSingletonScope();
});
