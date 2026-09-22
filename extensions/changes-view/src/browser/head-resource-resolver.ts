import { Resource, ResourceResolver } from "@theia/core/lib/common/resource";
import URI from "@theia/core/lib/common/uri";
import { inject, injectable } from "@theia/core/shared/inversify";
import { ChangesService } from "../common/changes-protocol";
import { decodeHeadUri, HEAD_SCHEME } from "../common/head-uri";

// Gives the diff editor the content of a file at HEAD.
@injectable()
export class HeadResourceResolver implements ResourceResolver {
  @inject(ChangesService)
  protected readonly changes!: ChangesService;

  resolve(uri: URI): Resource {
    if (uri.scheme !== HEAD_SCHEME) {
      throw new Error(`The scheme '${uri.scheme}' is not '${HEAD_SCHEME}'.`);
    }
    const { repoRootUri, path } = decodeHeadUri(uri);
    return {
      uri,
      readContents: () => this.changes.readHead(repoRootUri, path),
      dispose: () => undefined,
      readOnly: true,
    };
  }
}
