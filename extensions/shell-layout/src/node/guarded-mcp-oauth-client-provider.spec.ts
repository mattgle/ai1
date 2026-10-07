import "reflect-metadata";
import * as assert from "node:assert/strict";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPOAuthConfig } from "@theia/ai-mcp/lib/common/mcp-oauth";
import { MCPOAuthAuthorizationRequiredError } from "@theia/ai-mcp/lib/node/mcp-oauth-errors";
import { mcpOAuthAccount, MCP_OAUTH_KEYSTORE_SERVICE } from "@theia/ai-mcp/lib/node/mcp-oauth-keystore";
import { GuardedMCPOAuthClientProvider } from "./guarded-mcp-oauth-client-provider";

const trusted = "https://trusted.invalid/";
const changed = "https://changed.invalid/";
const resource = "https://resource.invalid/mcp";

function fixture(config: MCPOAuthConfig = {}, interactive = false) {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const deletes: string[] = [];
  const opened: string[] = [];
  const cancelled: string[] = [];
  const keyStore = {
    findPassword: async () => undefined,
    findCredentials: async () => [],
    keys: async () => Array.from(values.keys()),
    getPassword: async (_service: string, account: string) => values.get(account),
    setPassword: async (service: string, account: string, value: string) => {
      assert.equal(service, MCP_OAUTH_KEYSTORE_SERVICE);
      writes.push(account);
      values.set(account, value);
    },
    deletePassword: async (_service: string, account: string) => {
      deletes.push(account);
      return values.delete(account);
    },
  };
  const provider = new GuardedMCPOAuthClientProvider({
    serverName: "Fixture server",
    credentialScope: resource,
    config,
    callbackUrl: "http://127.0.0.1/fixture",
    stateValue: "fixture-state",
    keyStore,
    frontendDelegate: {
      openExternal: async (url: string) => {
        opened.push(url);
      },
    } as never,
    callbackService: {
      cancel: (state: string) => {
        cancelled.push(state);
      },
    } as never,
    interactive,
  });
  const set = (key: string, value: unknown) =>
    values.set(mcpOAuthAccount("Fixture server", resource, key), JSON.stringify(value));
  return { provider, values, writes, deletes, opened, cancelled, set };
}

function tokens(issuer: unknown) {
  return {
    access_token: "fixture-access",
    refresh_token: "fixture-refresh",
    token_type: "Bearer",
    issuer,
    saved_at: Date.now(),
  };
}

function discovery(issuer = trusted) {
  return {
    authorizationServerUrl: issuer,
    authorizationServerMetadata: {
      issuer,
      authorization_endpoint: issuer + "authorize",
      token_endpoint: issuer + "token",
      response_types_supported: ["code"],
    },
    resourceMetadata: { resource, authorization_servers: [issuer] },
  };
}

describe("GuardedMCPOAuthClientProvider", () => {
  for (const key of ["client", "tokens"] as const) {
    for (const issuer of [
      undefined,
      null,
      "",
      "not a URL",
      7,
      {},
      "https://user:secret@trusted.invalid/",
      trusted + "#fragment",
    ]) {
      it(`refuses ${key} with invalid issuer ${JSON.stringify(issuer)} without changing storage`, async () => {
        const f = fixture();
        f.set(key, key === "client" ? { client_id: "fixture-client", issuer } : tokens(issuer));
        const before = Array.from(f.values);
        await assert.rejects(
          key === "client" ? f.provider.clientInformation() : f.provider.tokens(),
          MCPOAuthAuthorizationRequiredError,
        );
        assert.deepEqual(Array.from(f.values), before);
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.deletes, []);
      });
    }
  }

  for (const key of ["client", "tokens", "discovery"] as const) {
    for (const raw of ["{", "null", "[]", '"text"', "7", "{}"]) {
      it(`refuses malformed ${key} record ${raw} without deleting it`, async () => {
        const f = fixture();
        f.values.set(mcpOAuthAccount("Fixture server", resource, key), raw);
        const before = Array.from(f.values);
        const read =
          key === "client"
            ? f.provider.clientInformation()
            : key === "tokens"
              ? f.provider.tokens()
              : f.provider.discoveryState();
        await assert.rejects(read, MCPOAuthAuthorizationRequiredError);
        assert.deepEqual(Array.from(f.values), before);
        assert.deepEqual(f.deletes, []);
      });
    }
  }

  it("refuses a static client without an explicit issuer pin", async () => {
    const f = fixture({ clientId: "fixture-client", clientSecret: "fixture-secret" });
    f.set("tokens", tokens(trusted));
    await assert.rejects(f.provider.clientInformation(), MCPOAuthAuthorizationRequiredError);
    await assert.rejects(f.provider.tokens(), MCPOAuthAuthorizationRequiredError);
    assert.deepEqual(f.deletes, []);
  });

  it("returns an explicit issuer on a pinned static client", async () => {
    const f = fixture({
      clientId: "fixture-client",
      clientSecret: "fixture-secret",
      authorizationServer: trusted,
    });
    assert.deepEqual(await f.provider.clientInformation(), {
      client_id: "fixture-client",
      client_secret: "fixture-secret",
      issuer: trusted,
    });
  });

  it("does not infer a legacy token issuer from an explicit pin", async () => {
    const f = fixture({ clientId: "fixture-client", authorizationServer: trusted });
    f.set("tokens", tokens(null));
    await assert.rejects(f.provider.tokens(), MCPOAuthAuthorizationRequiredError);
    assert.deepEqual(f.writes, []);
  });

  it("keeps valid issuer-bound client and token reads", async () => {
    const f = fixture();
    f.set("client", { client_id: "fixture-client", issuer: trusted });
    f.set("tokens", tokens(trusted));
    assert.equal((await f.provider.clientInformation())?.issuer, trusted);
    assert.equal((await f.provider.tokens())?.access_token, "fixture-access");
    assert.deepEqual(f.writes, []);
  });

  it("refuses changed discovery before writing any state", async () => {
    const f = fixture();
    f.set("client", { client_id: "fixture-client", issuer: trusted });
    f.set("tokens", tokens(trusted));
    const before = Array.from(f.values);
    await assert.rejects(
      f.provider.saveDiscoveryState(discovery(changed)),
      MCPOAuthAuthorizationRequiredError,
    );
    assert.deepEqual(Array.from(f.values), before);
  });

  it("checks credentials when cached discovery skips a new save", async () => {
    const f = fixture();
    f.set("client", { client_id: "fixture-client", issuer: trusted });
    f.set("tokens", tokens(trusted));
    f.set("discovery", discovery(changed));
    const before = Array.from(f.values);
    await assert.rejects(f.provider.discoveryState(), MCPOAuthAuthorizationRequiredError);
    assert.deepEqual(Array.from(f.values), before);
  });

  it("refuses cached discovery after an explicit pin changes", async () => {
    const f = fixture({ clientId: "fixture-client", authorizationServer: changed });
    f.set("discovery", discovery());
    await assert.rejects(f.provider.discoveryState(), MCPOAuthAuthorizationRequiredError);
    assert.deepEqual(f.writes, []);
  });

  it("permits fresh discovery without existing credentials", async () => {
    const f = fixture();
    await f.provider.saveDiscoveryState(discovery());
    await f.provider.saveClientInformation({ client_id: "fixture-new-client", issuer: trusted });
    await f.provider.saveTokens({
      access_token: "fixture-new-access",
      token_type: "Bearer",
      issuer: trusted,
    });
    assert.equal((await f.provider.tokens())?.access_token, "fixture-new-access");
    assert.deepEqual(f.deletes, []);
  });

  it("keeps fresh dynamic registration and authorization-code exchange through the real SDK", async () => {
    const f = fixture({}, true);
    const tokenRequests: string[] = [];
    const fetchFn: typeof fetch = async (input, options) => {
      const url = String(input);
      if (url.includes("resource.invalid") && url.includes(".well-known")) {
        return Response.json({ resource, authorization_servers: [trusted] });
      }
      if (url.includes("trusted.invalid") && url.includes(".well-known")) {
        return Response.json({
          ...discovery().authorizationServerMetadata,
          registration_endpoint: trusted + "register",
        });
      }
      if (url === trusted + "register")
        return Response.json(
          { ...f.provider.clientMetadata, client_id: "fixture-new-client" },
          { status: 201 },
        );
      if (url === trusted + "token") {
        tokenRequests.push(String(options?.body));
        return Response.json({ access_token: "fixture-new-access", token_type: "Bearer" });
      }
      throw new Error("Unexpected fixture request");
    };
    assert.equal(await auth(f.provider, { serverUrl: resource, fetchFn }), "REDIRECT");
    assert.equal(f.opened.length, 1);
    assert.equal((await f.provider.clientInformation())?.issuer, trusted);
    assert.equal(
      await auth(f.provider, { serverUrl: resource, authorizationCode: "fixture-code", fetchFn }),
      "AUTHORIZED",
    );
    assert.equal(tokenRequests.length, 1);
    assert.equal(new URLSearchParams(tokenRequests[0]).get("code"), "fixture-code");
    assert.equal((await f.provider.tokens())?.issuer, trusted);
    assert.deepEqual(f.deletes, []);
  });

  it("refuses an issuerless write rather than assigning the discovered issuer", async () => {
    const f = fixture();
    await f.provider.saveDiscoveryState(discovery());
    const before = Array.from(f.values);
    await assert.rejects(
      f.provider.saveClientInformation({ client_id: "fixture-client" }),
      MCPOAuthAuthorizationRequiredError,
    );
    await assert.rejects(
      f.provider.saveTokens({ access_token: "fixture-access", token_type: "Bearer" }),
      MCPOAuthAuthorizationRequiredError,
    );
    assert.deepEqual(Array.from(f.values), before);
  });

  it("keeps an authorized transport usable after Theia cancels the login callback", async () => {
    const f = fixture();
    f.set("tokens", tokens(trusted));
    f.provider.cancel();
    const requests: string[] = [];
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      authProvider: f.provider,
      fetch: async (_input, options) => {
        requests.push(new Headers(options?.headers).get("authorization") ?? "");
        return new Response(null, { status: 202 });
      },
    });
    try {
      await transport.start();
      await transport.send({ jsonrpc: "2.0", method: "ping", id: 1 });
      assert.deepEqual(requests, ["Bearer fixture-access"]);
    } finally {
      await transport.close();
    }
  });

  it("keeps issuer-bound refresh usable after the login callback ends", async () => {
    const f = fixture();
    f.set("client", { client_id: "fixture-client", issuer: trusted });
    f.set("tokens", tokens(trusted));
    f.set("discovery", discovery());
    f.provider.cancel();
    const fetchFn: typeof fetch = async (input, options) => {
      assert.equal(String(input), trusted + "token");
      assert.equal(new URLSearchParams(String(options?.body)).get("refresh_token"), "fixture-refresh");
      return Response.json({ access_token: "fixture-new-access", token_type: "Bearer" });
    };
    assert.equal(await auth(f.provider, { serverUrl: resource, fetchFn }), "AUTHORIZED");
    assert.equal((await f.provider.tokens())?.access_token, "fixture-new-access");
    assert.deepEqual(f.deletes, []);
  });

  it("refuses a cancelled code exchange without changing credentials or opening a browser", async () => {
    const f = fixture({}, true);
    f.set("client", { client_id: "fixture-client", issuer: trusted });
    await f.provider.saveDiscoveryState(discovery());
    await f.provider.saveCodeVerifier("fixture-verifier");
    const before = Array.from(f.values);
    f.provider.cancel();
    let requests = 0;
    await assert.rejects(
      auth(f.provider, {
        serverUrl: resource,
        authorizationCode: "fixture-code",
        fetchFn: async () => {
          requests++;
          throw new Error("Cancelled fixture must not send a token request");
        },
      }),
      MCPOAuthAuthorizationRequiredError,
    );
    await f.provider.saveCodeVerifier("fixture-late-verifier");
    await assert.rejects(f.provider.codeVerifier(), MCPOAuthAuthorizationRequiredError);
    assert.equal(requests, 0);
    assert.deepEqual(Array.from(f.values), before);
    assert.deepEqual(f.cancelled, ["fixture-state"]);
    await assert.rejects(
      f.provider.redirectToAuthorization(new URL(trusted + "authorize")),
      MCPOAuthAuthorizationRequiredError,
    );
    assert.deepEqual(f.opened, []);
  });
});
