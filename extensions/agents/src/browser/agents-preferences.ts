import {
  PreferenceContribution,
  PreferenceSchema,
} from "@theia/core/lib/common/preferences/preference-schema";
import { injectable } from "@theia/core/shared/inversify";

export const VISIBLE_PER_GROUP = "ai1.agents.visibleSessionsPerGroup";
export const NOTIFY_ON_BLOCKED = "ai1.agents.notifyOnBlocked";

export const agentsPreferenceSchema: PreferenceSchema = {
  properties: {
    [VISIBLE_PER_GROUP]: {
      type: "number",
      default: 30,
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
