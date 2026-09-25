import { ProxyClient } from "./one-page-proxy";

// The part of `OnePageProxy` that `AgentProxies` uses.
export interface AgentProxy {
  readonly connected: boolean;
  acceptClient(client: ProxyClient): void;
  stop(): void;
}

// The proxies of the agent tabs, one for each guest, in all windows. Each
// proxy has at most one client, and the clients of different guests stay
// connected together.
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
    const proxy = this.proxies.get(guestId);
    if (proxy) {
      proxy.acceptClient(client);
    } else {
      client.close();
    }
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
