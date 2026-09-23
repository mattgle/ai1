import { ConnectionContainerModule } from "@theia/core/lib/node/messaging/connection-container-module";
import { ContainerModule } from "@theia/core/shared/inversify";
import { AGENTS_SERVICE_PATH, AgentsClient, AgentsService } from "../common/agents-protocol";
import { AgentsServiceImpl } from "./agents-service-impl";
import { OpenCodeHub } from "./opencode-hub";

// `AgentsServiceImpl` is bound per RPC connection (`ConnectionContainerModule`,
// the pattern `@theia/debug` and the preferences back end use for state
// that is per-window, not global -- `AgentsServiceImpl`'s own comment has
// the full reasoning): each open window gets its own instance, its own
// `roots`, and its own `client`. `bindBackendService`'s own `onActivation`
// callback gets the connecting front end's client proxy directly (the
// same role `@theia/ai-core`'s `TokenUsageService` fills by hand with its
// own `RpcConnectionHandler`, since `bindBackendService` did not fit its
// case as written there); `setClient` on the freshly resolved,
// connection-scoped instance wires it. `OpenCodeHub` stays a
// main-container singleton (bound below, outside the connection module),
// one OpenCode connection and one event subscription for every window.
const agentsConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
  bind(AgentsServiceImpl).toSelf().inSingletonScope();
  bind(AgentsService).toService(AgentsServiceImpl);
  bindBackendService<AgentsService, AgentsClient>(AGENTS_SERVICE_PATH, AgentsService, (service, client) => {
    (service as AgentsServiceImpl).setClient(client);
    return service;
  });
});

export default new ContainerModule((bind) => {
  bind(OpenCodeHub).toSelf().inSingletonScope();
  bind(ConnectionContainerModule).toConstantValue(agentsConnectionModule);
});
