import { ConnectionHandler, RpcConnectionHandler } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { PORTS_SERVICE_PATH, PortsService } from "../common/ports-protocol";
import { PortsServiceImpl } from "./ports-service-impl";

export default new ContainerModule((bind) => {
  bind(PortsService)
    .toDynamicValue(() => new PortsServiceImpl())
    .inSingletonScope();
  bind(ConnectionHandler)
    .toDynamicValue(
      (context) => new RpcConnectionHandler(PORTS_SERVICE_PATH, () => context.container.get(PortsService)),
    )
    .inSingletonScope();
});
