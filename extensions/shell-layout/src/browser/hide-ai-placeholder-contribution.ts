import { AI_CONFIGURATION_OPEN_PREFERENCE_ID } from "@theia/ai-core/lib/browser/hide-ai-preferences-contribution";
import {
  PreferenceContribution,
  PreferenceSchemaService,
} from "@theia/core/lib/common/preferences/preference-schema";
import { injectable } from "@theia/core/shared/inversify";

// The ai-core package hides its preferences in the Settings view, but it keeps
// one entry that points to a view of a package that AI1 does not install.
// This contribution hides that entry too.
@injectable()
export class HideAiPlaceholderContribution implements PreferenceContribution {
  async initSchema(service: PreferenceSchemaService): Promise<void> {
    this.hide(service);
    // The entry can come after this call. Each schema change starts a new check.
    service.onDidChangeSchema(() => this.hide(service));
  }

  protected hide(service: PreferenceSchemaService): void {
    const property = service.getSchemaProperty(AI_CONFIGURATION_OPEN_PREFERENCE_ID);
    // The `hidden` check stops the loop: updateSchemaProperty fires onDidChangeSchema.
    if (property && !property.hidden) {
      service.updateSchemaProperty(AI_CONFIGURATION_OPEN_PREFERENCE_ID, { ...property, hidden: true });
    }
  }
}
