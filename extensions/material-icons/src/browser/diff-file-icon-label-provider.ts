import { DiffUriLabelProviderContribution, DiffUris } from "@theia/core/lib/browser/diff-uris";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { inject, injectable } from "@theia/core/shared/inversify";

@injectable()
export class DiffFileIconLabelProvider extends DiffUriLabelProviderContribution {
  constructor(@inject(LabelProvider) labelProvider: LabelProvider) {
    super(labelProvider);
  }

  override canHandle(element: object): number {
    return super.canHandle(element) ? 21 : 0;
  }

  override getIcon(uri: URI): string {
    const [left, right] = DiffUris.decode(uri);
    return this.labelProvider.getIcon(right ?? left);
  }
}
