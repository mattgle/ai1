import {
  PreferenceContribution,
  PreferenceSchema,
} from "@theia/core/lib/common/preferences/preference-schema";
import { injectable } from "@theia/core/shared/inversify";

export const OPEN_LINKS_IN = "ai1.browser.openLinksIn";

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
  },
};

@injectable()
export class BrowserPreferenceContribution implements PreferenceContribution {
  readonly schema = browserPreferenceSchema;
}
