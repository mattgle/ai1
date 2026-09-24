import { ProxyClient } from "./one-page-proxy";

// The part of `OnePageProxy` that `AgentProxies` uses.
export interface AgentProxy {
  readonly connected: boolean;
  acceptClient(client: ProxyClient): void;
  stop(): void;
}

// The proxies of the agent tabs, one for each guest, in all windows. The
// agent address keeps one client at a time: when a proxy gets a client, the
// other proxies lose theirs.
export class AgentProxies<P extends AgentProxy> {
  protected readonly proxies = new Map<number, P>();

  get(guestId: number): P | undefined {
    return this.proxies.get(guestId);
  }

  add(guestId: number, proxy: P): void {
    this.proxies.set(guestId, proxy);
  }

  // The guest is gone.
  remove(guestId: number): void {
    this.proxies.get(guestId)?.stop();
    this.proxies.delete(guestId);
  }

  accept(guestId: number, client: ProxyClient): void {
    for (const [otherId, other] of this.proxies) {
      if (otherId !== guestId && other.connected) {
        other.stop();
      }
    }
    const proxy = this.proxies.get(guestId);
    if (proxy) {
      proxy.acceptClient(client);
    } else {
      client.close();
    }
  }

  // The tab of this guest is no longer the agent tab.
  release(guestId: number): void {
    this.proxies.get(guestId)?.stop();
  }

  // The agent address stops.
  stopAll(): void {
    for (const proxy of this.proxies.values()) {
      proxy.stop();
    }
  }

  isConnected(guestId: number | undefined): boolean {
    return guestId !== undefined && this.proxies.get(guestId)?.connected === true;
  }
}
