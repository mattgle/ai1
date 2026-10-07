import "reflect-metadata";
import * as assert from "node:assert/strict";
import mcpBackendModule from "@theia/ai-mcp/lib/node/mcp-backend-module";
import { MCPOAuthConfig, MCPOAuthFrontendDelegate } from "@theia/ai-mcp/lib/common/mcp-oauth";
import { MCPOAuthCallbackService } from "@theia/ai-mcp/lib/node/mcp-oauth-callback-service";
import { MCPOAuthClientProviderFactory } from "@theia/ai-mcp/lib/node/mcp-oauth-client-provider-factory";
import { MCPOAuthClientProvider } from "@theia/ai-mcp/lib/node/mcp-oauth-client-provider";
import { MCPServer } from "@theia/ai-mcp/lib/node/mcp-server";
import { MCPServerStatus } from "@theia/ai-mcp/lib/common/mcp-server-manager";
import { mcpOAuthAccount } from "@theia/ai-mcp/lib/node/mcp-oauth-keystore";
import { KeyStoreService } from "@theia/core/lib/common/key-store";
import { ILogger } from "@theia/core/lib/common/logger";
import { ConnectionContainerModule } from "@theia/core/lib/node/messaging/connection-container-module";
import { Container, ContainerModule } from "@theia/core/shared/inversify";
import guardBackendModule from "./shell-layout-backend-module";
import { GuardedMCPOAuthClientProvider } from "./guarded-mcp-oauth-client-provider";
import { GuardedMCPOAuthClientProviderFactory } from "./guarded-mcp-oauth-client-provider-factory";

const callbackStates: Array<{ service: MCPOAuthCallbackService; state: string }> = [];

function connections() {
  const root = new Container();
  root.load(mcpBackendModule, guardBackendModule);
  root
    .bind(ILogger)
    .toConstantValue({ warn: () => undefined })
    .whenTargetNamed("ai-mcp:MCPOAuthCallbackService");
  const callbacks = root.get(MCPOAuthCallbackService);
  const createState = callbacks.createState.bind(callbacks);
  callbacks.createState = () => {
    const state = createState();
    callbackStates.push({ service: callbacks, state });
    return state;
  };
  const values = new Map<string, string>();
  root.bind<KeyStoreService>(KeyStoreService).toConstantValue({
    getPassword: async (_service, key) => values.get(key),
    setPassword: async (_service, key, value) => {
      values.set(key, value);
    },
    deletePassword: async (_service, key) => values.delete(key),
    findPassword: async () => undefined,
    findCredentials: async () => [],
    keys: async () => Array.from(values.keys()),
  });
  return (url: string, rejectFirst = false) => {
    const child = root.createChild();
    child.load(...root.getAll<ContainerModule>(ConnectionContainerModule));
    let redirectReads = 0;
    const opened: string[] = [];
    child.rebind<MCPOAuthFrontendDelegate>(MCPOAuthFrontendDelegate).toConstantValue({
      getEffectiveRedirectUrl: async () => {
        redirectReads++;
        if (rejectFirst && redirectReads === 1) throw new Error("Fixture redirect failure");
        return url;
      },
      getCallbackUrl: async () => url,
      openExternal: async (value) => {
        opened.push(value);
      },
      setClient: () => undefined,
      disconnectClient: () => undefined,
    });
    const factory = child.get(MCPOAuthClientProviderFactory);
    return { factory, opened, redirectReads: () => redirectReads, child, root, values };
  };
}

describe("GuardedMCPOAuthClientProviderFactory", () => {
  afterEach(() => {
    for (const { service, state } of callbackStates.splice(0)) {
      service.cancel(state);
      service.consumeRejectedCallbackMessage(state);
    }
  });

  it("stops real MCP startup without SSE fallback or credential removal", async () => {
    const f = connections()("http://127.0.0.1/fixture");
    const resource = "https://resource.invalid/mcp";
    f.values.set(
      mcpOAuthAccount("Fixture server", resource, "tokens"),
      JSON.stringify({ access_token: "fixture-access", token_type: "Bearer" }),
    );
    const before = Array.from(f.values);
    class FixtureServer extends MCPServer {
      sseAttempts = 0;
      protected override async connectTransport(provider: MCPOAuthClientProvider | undefined): Promise<void> {
        assert.ok(provider);
        await provider.tokens();
      }
      protected override createSSETransport(
        headers: Record<string, string> | undefined,
        provider: MCPOAuthClientProvider | undefined,
      ) {
        this.sseAttempts++;
        return super.createSSETransport(headers, provider);
      }
    }
    const server = new FixtureServer({ name: "Fixture server", serverUrl: resource, oauth: {} }, f.factory);
    await server.start();
    assert.equal(server.getStatus(), MCPServerStatus.AuthenticationRequired);
    assert.equal(server.sseAttempts, 0);
    assert.deepEqual(Array.from(f.values), before);
    assert.deepEqual(f.opened, []);
  });
  it("replaces the real Theia connection binding with one guarded factory per connection", async () => {
    const connect = connections();
    const first = connect("http://127.0.0.1/first");
    const second = connect("http://127.0.0.1/second");
    assert.ok(first.factory instanceof GuardedMCPOAuthClientProviderFactory);
    assert.equal(first.factory, first.child.get(MCPOAuthClientProviderFactory));
    assert.notEqual(first.factory, second.factory);
    assert.equal(first.root.isBound(MCPOAuthClientProviderFactory), false);
    const one = await first.factory.create(
      "Fixture server",
      "https://resource.invalid/mcp",
      {},
      { interactive: true },
    );
    const two = await second.factory.create(
      "Fixture server",
      "https://resource.invalid/mcp",
      {},
      { interactive: false },
    );
    assert.ok(one instanceof GuardedMCPOAuthClientProvider);
    assert.ok(two instanceof GuardedMCPOAuthClientProvider);
    assert.equal(one.redirectUrl, "http://127.0.0.1/first");
    assert.equal(two.redirectUrl, "http://127.0.0.1/second");
    assert.notEqual(one.getState(), two.getState());
    await one.redirectToAuthorization(new URL("https://trusted.invalid/authorize"));
    await assert.rejects(two.redirectToAuthorization(new URL("https://trusted.invalid/authorize")));
    assert.equal(first.opened.length, 1);
    assert.deepEqual(second.opened, []);
    one.cancel();
    two.cancel();
  });

  it("shares a pending callback URL only within its connection and retries a failed lookup", async () => {
    const first = connections()("http://127.0.0.1/fixture", true);
    await assert.rejects(
      first.factory.create("Fixture server", "https://resource.invalid/mcp", {}, { interactive: false }),
    );
    const providers = await Promise.all(
      ["one", "two"].map((name) =>
        first.factory.create(name, "https://resource.invalid/mcp", {}, { interactive: false }),
      ),
    );
    assert.equal(first.redirectReads(), 2);
    for (const provider of providers) provider.cancel();
  });

  it("keeps each flow's configuration separate from later changes", async () => {
    const f = connections()("http://127.0.0.1/fixture");
    const config: MCPOAuthConfig = {
      clientId: "fixture-client",
      authorizationServer: "https://trusted.invalid/",
      scopes: ["first"],
    };
    const first = await f.factory.create("Fixture server", "https://resource.invalid/mcp", config, {
      interactive: false,
    });
    config.authorizationServer = "https://changed.invalid/";
    config.scopes?.push("second");
    const second = await f.factory.create("Fixture server", "https://resource.invalid/mcp", config, {
      interactive: false,
    });
    assert.equal((await first.clientInformation())?.issuer, "https://trusted.invalid/");
    assert.equal((await second.clientInformation())?.issuer, "https://changed.invalid/");
    assert.equal(first.clientMetadata.scope, "first");
    assert.equal(second.clientMetadata.scope, "first second");
    assert.equal(f.child.parent?.get(MCPOAuthCallbackService), f.root.get(MCPOAuthCallbackService));
    first.cancel();
    second.cancel();
  });
});
