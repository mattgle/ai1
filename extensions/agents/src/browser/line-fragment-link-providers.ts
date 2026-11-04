import { injectable } from "@theia/core/shared/inversify";
import {
  FileLinkProvider,
  LocalFileLinkProvider,
} from "@theia/terminal/lib/browser/terminal-file-link-provider";
import { FileUriLinkProvider } from "@theia/terminal/lib/browser/terminal-file-uri-link-provider";

function splitLineFragment(link: string) {
  const match = /#L([1-9]\d*)(?:C([1-9]\d*))?(?:-L[1-9]\d*(?:C[1-9]\d*)?)?$/.exec(link);
  if (!match) return undefined;
  return {
    path: link.slice(0, match.index),
    position: { line: Number(match[1]) - 1, character: match[2] ? Number(match[2]) - 1 : 0 },
  };
}

@injectable()
export class LineFragmentFileLinkProvider extends FileLinkProvider {
  protected override async extractPath(link: string): Promise<string | undefined> {
    return super.extractPath(splitLineFragment(link)?.path ?? link);
  }

  protected override async extractPosition(link: string) {
    return splitLineFragment(link)?.position ?? super.extractPosition(link);
  }
}

@injectable()
export class LineFragmentLocalFileLinkProvider extends LocalFileLinkProvider {
  protected override async extractPath(link: string): Promise<string | undefined> {
    return super.extractPath(splitLineFragment(link)?.path ?? link);
  }

  protected override async extractPosition(link: string) {
    return splitLineFragment(link)?.position ?? super.extractPosition(link);
  }
}

@injectable()
export class LineFragmentFileUriLinkProvider extends FileUriLinkProvider {
  protected override splitPosition(link: string) {
    const fragment = splitLineFragment(link);
    return fragment ? { fileUri: fragment.path, position: fragment.position } : super.splitPosition(link);
  }
}
