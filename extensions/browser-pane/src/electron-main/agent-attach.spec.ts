import * as assert from "node:assert";
import { AgentAttachHost, DEVTOOLS_REFUSAL, prepareAgentAttach } from "./agent-attach";

function setup(devToolsOpen: boolean) {
  const calls: string[] = [];
  const host: AgentAttachHost = {
    entry: (guestId) => (guestId === 7 ? { windowId: 1, tabId: "tab-a" } : undefined),
    devToolsOpened: () => devToolsOpen,
    restoreWaiting: (windowId, tabId) => calls.push(`restore ${windowId} ${tabId}`),
    notify: (windowId, text) => calls.push(`notify ${windowId} ${text}`),
    release: async (guestId) => {
      calls.push(`release ${guestId}`);
    },
  };
  return { host, calls };
}

describe("prepareAgentAttach", () => {
  it("releases the viewport emulation when DevTools is closed", async () => {
    const { host, calls } = setup(false);
    await prepareAgentAttach(7, host);
    assert.deepStrictEqual(calls, ["release 7"]);
  });

  it("refuses before the release when DevTools is open, so the tab stays as it was", async () => {
    const { host, calls } = setup(true);
    await assert.rejects(prepareAgentAttach(7, host), { message: DEVTOOLS_REFUSAL });
    assert.deepStrictEqual(calls, ["restore 1 tab-a", `notify 1 ${DEVTOOLS_REFUSAL}`]);
  });

  it("releases a guest that is not a registered tab, so the caller can refuse it later", async () => {
    const { host, calls } = setup(true);
    await prepareAgentAttach(8, host);
    assert.deepStrictEqual(calls, ["release 8"]);
  });
});
