import * as assert from "node:assert";
import { AgentProxies, AgentProxy } from "./agent-proxies";
import { ProxyClient } from "./one-page-proxy";

class FakeProxy implements AgentProxy {
  client: ProxyClient | undefined;
  stops = 0;
  get connected(): boolean {
    return this.client !== undefined;
  }
  acceptClient(client: ProxyClient): void {
    this.client = client;
  }
  stop(): void {
    this.stops++;
    this.client = undefined;
  }
}

const client = {} as ProxyClient;

function setup() {
  const proxies = new AgentProxies<FakeProxy>();
  const first = new FakeProxy();
  const second = new FakeProxy();
  proxies.add(1, first);
  proxies.add(2, second);
  return { proxies, first, second };
}

describe("AgentProxies", () => {
  it("stops the other proxies when a proxy gets a client, so one client is connected at a time", () => {
    const { proxies, first, second } = setup();
    proxies.accept(1, client);
    proxies.accept(2, client);
    assert.strictEqual(first.connected, false);
    assert.strictEqual(second.connected, true);
    assert.strictEqual(second.stops, 0);
  });

  it("stops every proxy when the agent address stops", () => {
    const { proxies, first, second } = setup();
    first.acceptClient(client);
    second.acceptClient(client);
    proxies.stopAll();
    assert.strictEqual(first.connected, false);
    assert.strictEqual(second.connected, false);
  });

  it("stops only the proxy of the released guest", () => {
    const { proxies, first, second } = setup();
    proxies.accept(2, client);
    proxies.release(1);
    proxies.release(3);
    assert.strictEqual(first.stops, 1);
    assert.strictEqual(second.connected, true);
    proxies.release(2);
    assert.strictEqual(second.connected, false);
  });

  it("stops and forgets the proxy of a removed guest", () => {
    const { proxies, first } = setup();
    proxies.accept(1, client);
    proxies.remove(1);
    assert.strictEqual(first.connected, false);
    assert.strictEqual(proxies.get(1), undefined);
  });

  it("tells if the proxy of a guest has a client", () => {
    const { proxies } = setup();
    proxies.accept(1, client);
    assert.strictEqual(proxies.isConnected(1), true);
    assert.strictEqual(proxies.isConnected(2), false);
    assert.strictEqual(proxies.isConnected(3), false);
    assert.strictEqual(proxies.isConnected(undefined), false);
  });
});
