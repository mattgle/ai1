import {
  PreferenceContribution,
  PreferenceSchema,
} from "@theia/core/lib/common/preferences/preference-schema";
import { injectable } from "@theia/core/shared/inversify";

export const OPEN_LINKS_IN = "ai1.browser.openLinksIn";
export const AGENT_ADDRESS_ENABLED = "ai1.browser.agentAddress.enabled";
export const AGENT_ADDRESS_PORT = "ai1.browser.agentAddress.port";

export const browserPreferenceSchema: PreferenceSchema = {
  properties: {
    [OPEN_LINKS_IN]: {
      type: "string",
      enum: ["ask", "ai1", "system"],
      enumDescriptions: [
        "Ask one time, then remember the answer.",
        "Open web links in AI1 Browser.",
        "Open web links in the system browser.",
      ],
      default: "ask",
      description:
        "Where AI1 opens a web link. Hold Shift with the click to use the other browser for that click.",
    },
    [AGENT_ADDRESS_ENABLED]: {
      type: "boolean",
      default: false,
      description:
        "Turn on the local agent address, so an agent can control the agent tab through Playwright MCP. Use the command 'Browser: Copy Playwright MCP Config' to get the OpenCode config.",
    },
    [AGENT_ADDRESS_PORT]: {
      type: "integer",
      minimum: 1024,
      maximum: 65535,
      default: 9333,
      description: "The port of the local agent address. It listens on 127.0.0.1 only.",
    },
  },
};

@injectable()
export class BrowserPreferenceContribution implements PreferenceContribution {
  readonly schema = browserPreferenceSchema;
}
