import { ConnectionHandler, RpcConnectionHandler } from "@theia/core/lib/common";
import { BackendApplicationContribution } from "@theia/core/lib/node/backend-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MATERIAL_ICONS_SERVICE_PATH, MaterialIconsService } from "../common/material-icons-protocol";
import { MaterialIconsBackendContribution } from "./material-icons-backend-contribution";
import { MaterialIconsServiceImpl } from "./material-icons-service-impl";

export default new ContainerModule((bind) => {
  bind(MaterialIconsBackendContribution).toSelf().inSingletonScope();
  bind(BackendApplicationContribution).toService(MaterialIconsBackendContribution);

  bind(MaterialIconsService).to(MaterialIconsServiceImpl).inSingletonScope();
  bind(ConnectionHandler)
    .toDynamicValue(
      (context) =>
        new RpcConnectionHandler(MATERIAL_ICONS_SERVICE_PATH, () =>
          context.container.get(MaterialIconsService),
        ),
    )
    .inSingletonScope();
});
