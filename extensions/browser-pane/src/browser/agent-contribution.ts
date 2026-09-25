import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ClipboardService } from "@theia/core/lib/browser/clipboard-service";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import {
  PreferenceProviderProvider,
  PreferenceScope,
  PreferenceService,
} from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { AgentTabState } from "../common/browser-ipc";
import { buildMcpConfig } from "../common/mcp-config";
import { AGENT_PROFILE_ID } from "../common/profiles";
import { userPreference } from "../common/user-preference";
import { browserApi } from "./browser-api";
import { AGENT_ADDRESS_ENABLED, AGENT_ADDRESS_PORT } from "./browser-preferences";
import { BrowserTabs } from "./browser-tabs";

export const AgentCommands = {
  COPY_MCP_CONFIG: { id: "ai1.browser.copyMcpConfig", label: "Browser: Copy Playwright MCP Config" },
  CANCEL_GIVE_TO_AGENT: { id: "ai1.browser.cancelGiveToAgent", label: "Browser: Cancel Give to Agent" },
} satisfies Record<string, Command>;

// The front-end part of the agent address: it starts or stops the address
// when the preferences change, opens an agent tab when the main process asks
// for one, marks the waiting and the connected tabs, and copies the MCP
// config.
@injectable()
export class AgentContribution implements FrontendApplicationContribution, CommandContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(PreferenceProviderProvider)
  protected readonly preferenceProviders!: PreferenceProviderProvider;

  @inject(BrowserTabs)
  protected readonly tabs!: BrowserTabs;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(ClipboardService)
  protected readonly clipboard!: ClipboardService;

  // The last agent state of the tabs of this window.
  protected states: AgentTabState[] = [];

  async onStart(): Promise<void> {
    const api = browserApi();
    api.onCreateAgentTab(async (request) => {
      const widget = await this.tabs.open("about:blank", AGENT_PROFILE_ID, { activate: false });
      await api.agentTabCreated(request.requestId, widget.tabId);
    });
    api.onAgentState((states) => {
      this.states = states;
      for (const widget of this.tabs.all()) {
        widget.setAgentState(states.find((state) => state.tabId === widget.tabId));
      }
    });
    await this.preferences.ready;
    await this.applyPreferences();
    // Listen to the user settings themselves. `onPreferenceChanged` does not
    // fire for a user change when a workspace or folder value of the same
    // key exists (Theia 1.75 `reconcilePreferences`). Then a change of the
    // owner, for example "off", has no effect until a reload.
    this.preferenceProviders(PreferenceScope.User)?.onDidPreferencesChanged((changes) => {
      if (AGENT_ADDRESS_ENABLED in changes || AGENT_ADDRESS_PORT in changes) {
        void this.applyPreferences();
      }
    });
  }

  protected async applyPreferences(): Promise<void> {
    const result = await browserApi().configureAgentAddress({
      // Only the user settings count: a repository must not turn on the
      // agent address.
      enabled: userPreference(this.preferences, AGENT_ADDRESS_ENABLED, false),
      port: userPreference(this.preferences, AGENT_ADDRESS_PORT, 9333),
    });
    if (!result.ok) {
      void this.messages.error(result.error);
    }
  }

  registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(AgentCommands.CANCEL_GIVE_TO_AGENT, {
      isEnabled: () => this.states.some((state) => state.state === "waiting"),
      execute: () => browserApi().giveToAgent(undefined),
    });
    registry.registerCommand(AgentCommands.COPY_MCP_CONFIG, {
      execute: async () => {
        const address = await browserApi().agentAddress();
        if (address === undefined) {
          await this.messages.warn(
            `The agent address is off. Set ${AGENT_ADDRESS_ENABLED} to true, then run this command again.`,
          );
          return;
        }
        await this.clipboard.writeText(buildMcpConfig(address));
        await this.messages.info(
          "The Playwright MCP config for OpenCode is on the clipboard. It contains a secret: keep it private.",
        );
      },
    });
  }
}
