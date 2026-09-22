import { injectable } from "@theia/core/shared/inversify";
import {
  PreferenceLayout,
  PreferenceLayoutProvider,
} from "@theia/preferences/lib/browser/util/preference-layout";

// The Settings view lists its categories from a fixed layout. That layout has
// an "AI Features" entry, and AI1 has no AI user interface. So the entry goes.
@injectable()
export class AiFreeLayoutProvider extends PreferenceLayoutProvider {
  override getLayout(): PreferenceLayout[] {
    return super.getLayout().filter((section) => section.id !== "ai-features");
  }
}
