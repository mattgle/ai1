import { ConnectionContainerModule } from "@theia/core/lib/node/messaging/connection-container-module";
import { ContainerModule } from "@theia/core/shared/inversify";
import { UPDATER_SERVICE_PATH, UpdaterClient, UpdaterService } from "../common/updater-protocol";
import { UpdaterServiceImpl } from "./updater-service";

const updaterConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
  bind(UpdaterServiceImpl).toSelf().inSingletonScope();
  bind(UpdaterService).toService(UpdaterServiceImpl);
  bindBackendService<UpdaterService, UpdaterClient>(UPDATER_SERVICE_PATH, UpdaterService);
});

export default new ContainerModule((bind) => {
  bind(ConnectionContainerModule).toConstantValue(updaterConnectionModule);
});
