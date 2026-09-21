import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DEFAULT_PREFERENCES, selectUnsetDefaults } from "./default-preferences";

@injectable()
export class DefaultPreferencesContribution implements FrontendApplicationContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  async onStart(): Promise<void> {
    await this.preferences.ready;
    const toSet = selectUnsetDefaults(DEFAULT_PREFERENCES, (name) => {
      const inspection = this.preferences.inspect(name);
      return {
        known: inspection !== undefined && inspection.defaultValue !== undefined,
        setByUser: inspection !== undefined && inspection.globalValue !== undefined,
      };
    });
    for (const [name, value] of Object.entries(toSet)) {
      try {
        await this.preferences.set(name, value, PreferenceScope.User);
      } catch (error) {
        console.warn(`ai1-shell-layout: could not set the default for ${name}`, error);
      }
    }
  }
}
