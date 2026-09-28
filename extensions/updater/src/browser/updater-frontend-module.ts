import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ServiceConnectionProvider } from "@theia/core/lib/browser/messaging/service-connection-provider";
import { CommandContribution } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { UPDATER_SERVICE_PATH, UpdaterService } from "../common/updater-protocol";
import { UpdaterContribution } from "./updater-contribution";

export default new ContainerModule((bind) => {
  bind(UpdaterService)
    .toDynamicValue((context) =>
      ServiceConnectionProvider.createProxy<UpdaterService>(context.container, UPDATER_SERVICE_PATH),
    )
    .inSingletonScope();
  bind(UpdaterContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(UpdaterContribution);
  bind(FrontendApplicationContribution).toService(UpdaterContribution);
});
