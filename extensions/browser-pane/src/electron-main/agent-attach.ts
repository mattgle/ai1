// The step before an agent gets the debugger of a guest. It has no
// `electron` import, so plain mocha tests it.

export const DEVTOOLS_REFUSAL =
  "An agent cannot connect while DevTools is open on the agent tab. Close DevTools, then connect again.";

export interface AgentAttachHost {
  // The window and the tab of a registered guest.
  entry(guestId: number): { windowId: number; tabId: string } | undefined;
  devToolsOpened(guestId: number): boolean;
  // Gives the "Waiting for agent" mark back to the tab.
  restoreWaiting(windowId: number, tabId: string): void;
  // Shows the text to the owner in this window.
  notify(windowId: number, text: string): void;
  // Clears the viewport emulation of the guest and detaches its debugger.
  release(guestId: number): Promise<void>;
}

// Refuses the connection when DevTools is open on the tab. The check comes
// before the release, so a refused connection leaves the tab as it was: its
// viewport size stays, and the tab waits again.
export async function prepareAgentAttach(guestId: number, host: AgentAttachHost): Promise<void> {
  const entry = host.entry(guestId);
  if (entry && host.devToolsOpened(guestId)) {
    host.restoreWaiting(entry.windowId, entry.tabId);
    host.notify(entry.windowId, DEVTOOLS_REFUSAL);
    throw new Error(DEVTOOLS_REFUSAL);
  }
  await host.release(guestId);
}
