import {
  PreferenceContribution,
  PreferenceSchema,
} from "@theia/core/lib/common/preferences/preference-schema";
import { injectable } from "@theia/core/shared/inversify";
import { DEFAULT_VISIBLE_PER_GROUP } from "../common/visible-per-group";
import { GHOSTTY_COLORS, TERMINAL_APPEARANCE, TERMINAL_COLOR_OVERRIDES } from "../common/terminal-appearance";

export const VISIBLE_PER_GROUP = "ai1.agents.visibleSessionsPerGroup";
export const NOTIFY_ON_BLOCKED = "ai1.agents.notifyOnBlocked";

export const agentsPreferenceSchema: PreferenceSchema = {
  properties: {
    [TERMINAL_APPEARANCE]: {
      type: "string",
      enum: ["ghostty", "theme"],
      default: "ghostty",
      description:
        "Use the Ghostty 0x96f terminal colors or the editor theme's terminal colors. High-contrast themes keep their own colors.",
    },
    [TERMINAL_COLOR_OVERRIDES]: {
      type: "object",
      default: {},
      additionalProperties: false,
      properties: Object.fromEntries(
        Object.keys(GHOSTTY_COLORS).map((key) => [
          key,
          { type: "string", pattern: "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$" },
        ]),
      ),
      description:
        'Override terminal colors with hexadecimal values. For example: {"background": "#262427"}.',
    },
    [VISIBLE_PER_GROUP]: {
      type: "integer",
      minimum: 1,
      default: DEFAULT_VISIBLE_PER_GROUP,
      description:
        "How many sessions of one repository the Agents view shows before it folds the older ones.",
    },
    [NOTIFY_ON_BLOCKED]: {
      type: "boolean",
      default: true,
      description: "Show a notification when a session waits for a permission.",
    },
  },
};

@injectable()
export class AgentsPreferenceContribution implements PreferenceContribution {
  readonly schema = agentsPreferenceSchema;
}
