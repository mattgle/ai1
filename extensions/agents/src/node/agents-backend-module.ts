import { ConnectionHandler, RpcConnectionHandler } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { AGENTS_SERVICE_PATH, AgentsClient, AgentsService } from "../common/agents-protocol";
import { AgentsServiceImpl } from "./agents-service-impl";

export default new ContainerModule((bind) => {
  bind(AgentsServiceImpl).toSelf().inSingletonScope();
  bind(AgentsService).toService(AgentsServiceImpl);
  bind(ConnectionHandler)
    .toDynamicValue(
      (context) =>
        new RpcConnectionHandler<AgentsClient>(AGENTS_SERVICE_PATH, (client) => {
          const service = context.container.get<AgentsServiceImpl>(AgentsServiceImpl);
          service.setClient(client);
          client.onDidCloseConnection(() => service.setClient(undefined));
          return service;
        }),
    )
    .inSingletonScope();
});
