import { MCPOAuthConfig } from "@theia/ai-mcp/lib/common/mcp-oauth";
import { MCPOAuthClientProviderFactory } from "@theia/ai-mcp/lib/node/mcp-oauth-client-provider-factory";
import { deriveCredentialScope } from "@theia/ai-mcp/lib/node/mcp-oauth-keystore";
import { injectable } from "@theia/core/shared/inversify";
import { GuardedMCPOAuthClientProvider } from "./guarded-mcp-oauth-client-provider";

@injectable()
export class GuardedMCPOAuthClientProviderFactory extends MCPOAuthClientProviderFactory {
  override async create(
    serverName: string,
    serverUrl: string,
    config: MCPOAuthConfig,
    options: { interactive: boolean },
  ): Promise<GuardedMCPOAuthClientProvider> {
    const callbackUrl = await this.getCallbackUrl();
    return new GuardedMCPOAuthClientProvider({
      serverName,
      credentialScope: deriveCredentialScope(serverUrl, config),
      config: { ...config, ...(config.scopes && { scopes: [...config.scopes] }) },
      callbackUrl,
      stateValue: this.callbackService.createState(),
      keyStore: this.keyStore,
      frontendDelegate: this.frontendDelegate,
      callbackService: this.callbackService,
      interactive: options.interactive,
    });
  }
}
