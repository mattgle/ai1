import { ConnectionHandler, RpcConnectionHandler } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { CHANGES_SERVICE_PATH, ChangesService } from "../common/changes-protocol";
import { ChangesServiceImpl } from "./changes-service-impl";

export default new ContainerModule((bind) => {
  bind(ChangesService).to(ChangesServiceImpl).inTransientScope();
  bind(ConnectionHandler)
    .toDynamicValue(
      (context) =>
        new RpcConnectionHandler(CHANGES_SERVICE_PATH, () => context.container.get(ChangesService)),
    )
    .inSingletonScope();
});
