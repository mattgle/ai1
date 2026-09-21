import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { PreferenceSchemaService } from "@theia/core/lib/common/preferences/preference-schema";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DEFAULT_PREFERENCES, selectUnsetDefaults } from "./default-preferences";

@injectable()
export class DefaultPreferencesContribution implements FrontendApplicationContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(PreferenceSchemaService)
  protected readonly schemas!: PreferenceSchemaService;

  async onStart(): Promise<void> {
    await this.preferences.ready;
    await this.schemas.ready;
    const toSet = selectUnsetDefaults(DEFAULT_PREFERENCES, (name) => ({
      // A schema entry can have no default value, so the schema is the source of truth.
      known: this.schemas.getSchemaProperty(name) !== undefined,
      setByUser: this.preferences.inspect(name)?.globalValue !== undefined,
    }));
    for (const [name, value] of Object.entries(toSet)) {
      try {
        await this.preferences.set(name, value, PreferenceScope.User);
      } catch (error) {
        console.warn(`ai1-shell-layout: could not set the default for ${name}`, error);
      }
    }
  }
}
