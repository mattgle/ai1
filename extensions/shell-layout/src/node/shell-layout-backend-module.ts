import { MCPOAuthClientProviderFactory } from "@theia/ai-mcp/lib/node/mcp-oauth-client-provider-factory";
import { ConnectionContainerModule } from "@theia/core/lib/node/messaging/connection-container-module";
import { ContainerModule } from "@theia/core/shared/inversify";
import { GuardedMCPOAuthClientProviderFactory } from "./guarded-mcp-oauth-client-provider-factory";

const credentialGuardModule = ConnectionContainerModule.create(({ rebind }) => {
  // Replace the factory after Theia loads its connection bindings. Each window keeps its own delegate.
  rebind(MCPOAuthClientProviderFactory).to(GuardedMCPOAuthClientProviderFactory).inSingletonScope();
});

export default new ContainerModule((bind) => {
  bind(ConnectionContainerModule).toConstantValue(credentialGuardModule);
});
