import {
  PreferenceContribution,
  PreferenceSchema,
} from "@theia/core/lib/common/preferences/preference-schema";
import { PreferenceScope } from "@theia/core/lib/common/preferences/preference-scope";
import { injectable } from "@theia/core/shared/inversify";
import { ALL_REPOSITORY_LEVELS, REPOSITORY_SCAN_DEPTH } from "../common/repository-scan-depth";
import { CHANGES_REFRESH_MODE } from "../common/changes-refresh-mode";

export const changesPreferenceSchema: PreferenceSchema = {
  properties: {
    [CHANGES_REFRESH_MODE]: {
      type: "string",
      enum: ["automatic", "manual"],
      default: "automatic",
      scope: PreferenceScope.Workspace,
      description:
        "Refresh Changes automatically for affected repositories, or only on workspace open and explicit refresh. A workspace value overrides the app profile value.",
    },
    [REPOSITORY_SCAN_DEPTH]: {
      type: "integer",
      minimum: -1,
      default: ALL_REPOSITORY_LEVELS,
      scope: PreferenceScope.Workspace,
      description:
        "Repository search depth for Changes. Use -1 for all levels, 0 for each workspace root only, or 1 for its direct children. A workspace value overrides the app profile value.",
    },
  },
};

@injectable()
export class ChangesPreferenceContribution implements PreferenceContribution {
  readonly schema = changesPreferenceSchema;
}
