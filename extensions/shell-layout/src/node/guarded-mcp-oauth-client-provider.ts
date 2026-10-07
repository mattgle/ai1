import { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformationMixed,
  OAuthClientInformationSchema,
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
  OAuthTokens,
  OAuthTokensSchema,
  SafeUrlSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { MCPOAuthClientProvider } from "@theia/ai-mcp/lib/node/mcp-oauth-client-provider";
import { MCPOAuthAuthorizationRequiredError } from "@theia/ai-mcp/lib/node/mcp-oauth-errors";
import { MCP_OAUTH_KEYSTORE_SERVICE, StoredOAuthValue } from "@theia/ai-mcp/lib/node/mcp-oauth-keystore";

export class MCPOAuthCredentialGuardError extends MCPOAuthAuthorizationRequiredError {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = "MCPOAuthCredentialGuardError";
  }
}

export class GuardedMCPOAuthClientProvider extends MCPOAuthClientProvider {
  protected selectedIssuer: string | undefined;

  override async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    this.checkStaticClient();
    const client = await super.clientInformation();
    if (client && this.config.clientId) {
      return { ...client, issuer: this.checkIssuer(this.config.authorizationServer) };
    }
    if (client) this.checkIssuer(client.issuer);
    return client;
  }

  override async tokens(): Promise<OAuthTokens | undefined> {
    this.checkStaticClient();
    const tokens = await super.tokens();
    if (tokens) this.checkIssuer(tokens.issuer);
    return tokens;
  }

  override async saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
    this.checkStaticClient();
    this.checkIssuer(client.issuer);
    await super.saveClientInformation(client);
  }

  override async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.checkStaticClient();
    this.checkIssuer(tokens.issuer);
    await super.saveTokens(tokens);
  }

  override async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    // The upstream getter ignores a changed pin. This guard must stop instead of rediscovering.
    const state = await this.read<OAuthDiscoveryState>("discovery");
    if (state) await this.acceptDiscovery(state);
    return state;
  }

  override async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await this.acceptDiscovery(state);
    await super.saveDiscoveryState(state);
  }

  protected async acceptDiscovery(state: OAuthDiscoveryState): Promise<void> {
    this.checkStaticClient();
    const issuer = this.checkIssuer(state.authorizationServerUrl);
    this.checkDiscovery(state);
    const client = await this.clientInformation();
    const tokens = await this.tokens();
    if (client) this.requireSameIssuer(client.issuer, issuer);
    if (tokens) this.requireSameIssuer(tokens.issuer, issuer);
    this.selectedIssuer = issuer;
  }

  protected override async read<T extends StoredOAuthValue>(key: string): Promise<T | undefined> {
    const raw = await this.keyStore.getPassword(MCP_OAUTH_KEYSTORE_SERVICE, this.account(key));
    if (raw === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw this.invalidRecord();
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw this.invalidRecord();
    const record = value as Record<string, unknown>;
    if (key === "client") {
      if (!OAuthClientInformationSchema.safeParse(record).success) throw this.invalidRecord();
      this.checkIssuer(record.issuer);
    } else if (key === "tokens") {
      if (!OAuthTokensSchema.safeParse(record).success) throw this.invalidRecord();
      if (
        record.saved_at !== undefined &&
        (typeof record.saved_at !== "number" || !Number.isFinite(record.saved_at))
      ) {
        throw this.invalidRecord();
      }
      this.checkIssuer(record.issuer);
    } else if (key === "discovery") {
      this.checkDiscovery(record);
    }
    return value as T;
  }

  protected checkDiscovery(state: Record<string, unknown> | OAuthDiscoveryState): void {
    const issuer = this.checkIssuer(state.authorizationServerUrl);
    if (state.authorizationServerMetadata !== undefined) {
      const parsed = OAuthMetadataSchema.safeParse(state.authorizationServerMetadata);
      if (!parsed.success) throw this.invalidRecord();
      this.requireSameIssuer(parsed.data.issuer, issuer);
    }
    if (
      state.resourceMetadata !== undefined &&
      !OAuthProtectedResourceMetadataSchema.safeParse(state.resourceMetadata).success
    ) {
      throw this.invalidRecord();
    }
    if (
      state.resourceMetadataUrl !== undefined &&
      !SafeUrlSchema.safeParse(state.resourceMetadataUrl).success
    ) {
      throw this.invalidRecord();
    }
  }

  protected checkStaticClient(): void {
    if (this.config.clientId) this.checkIssuer(this.config.authorizationServer);
  }

  protected checkIssuer(value: unknown): string {
    const issuer = this.parseIssuer(value);
    if (this.config.authorizationServer !== undefined) {
      this.requireSameIssuer(issuer, this.parseIssuer(this.config.authorizationServer));
    }
    if (this.selectedIssuer !== undefined) this.requireSameIssuer(issuer, this.selectedIssuer);
    return issuer;
  }

  protected requireSameIssuer(value: unknown, expected: string): void {
    if (this.parseIssuer(value) !== expected) {
      throw new MCPOAuthCredentialGuardError(
        "MCP OAuth credentials do not match the authorization server. Stored records stay unchanged.",
      );
    }
  }

  protected parseIssuer(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) throw this.invalidRecord();
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw this.invalidRecord();
      }
      return url.href;
    } catch {
      throw this.invalidRecord();
    }
  }

  protected invalidRecord(): MCPOAuthCredentialGuardError {
    return new MCPOAuthCredentialGuardError(
      "MCP OAuth credentials need a valid issuer. Static clients need an explicit authorizationServer. Review the connection before sign-in. Stored records stay unchanged.",
    );
  }
}
