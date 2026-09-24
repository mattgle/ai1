import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ClipboardService } from "@theia/core/lib/browser/clipboard-service";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { buildMcpConfig } from "../common/mcp-config";
import { AGENT_PROFILE_ID } from "../common/profiles";
import { browserApi } from "./browser-api";
import { AGENT_ADDRESS_ENABLED, AGENT_ADDRESS_PORT } from "./browser-preferences";
import { BrowserTabs } from "./browser-tabs";

export const AgentCommands = {
  COPY_MCP_CONFIG: { id: "ai1.browser.copyMcpConfig", label: "Browser: Copy Playwright MCP Config" },
} satisfies Record<string, Command>;

// The front-end part of the agent address: it starts or stops the address
// when the preferences change, opens an agent tab when the main process asks
// for one, marks the agent tab, and copies the MCP config.
@injectable()
export class AgentContribution implements FrontendApplicationContribution, CommandContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(BrowserTabs)
  protected readonly tabs!: BrowserTabs;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(ClipboardService)
  protected readonly clipboard!: ClipboardService;

  async onStart(): Promise<void> {
    const api = browserApi();
    api.onCreateAgentTab(async (request) => {
      const widget = await this.tabs.open("about:blank", AGENT_PROFILE_ID);
      await api.agentTabCreated(request.requestId, widget.tabId);
    });
    api.onAgentState((state) => {
      for (const widget of this.tabs.all()) {
        widget.setAgentMark(widget.tabId === state.tabId, state.connected);
      }
    });
    await this.preferences.ready;
    await this.applyPreferences();
    this.preferences.onPreferenceChanged((change) => {
      if (change.preferenceName === AGENT_ADDRESS_ENABLED || change.preferenceName === AGENT_ADDRESS_PORT) {
        void this.applyPreferences();
      }
    });
  }

  protected async applyPreferences(): Promise<void> {
    const result = await browserApi().configureAgentAddress({
      enabled: this.preferences.get<boolean>(AGENT_ADDRESS_ENABLED, false),
      port: this.preferences.get<number>(AGENT_ADDRESS_PORT, 9333),
    });
    if (!result.ok) {
      void this.messages.error(result.error);
    }
  }

  registerCommands(registry: CommandRegistry): void {
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
