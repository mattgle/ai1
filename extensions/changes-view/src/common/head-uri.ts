import URI from "@theia/core/lib/common/uri";

export const HEAD_SCHEME = "ai1-head";

export interface HeadLocation {
  repoRootUri: string;
  path: string;
}

// The URI of a file at HEAD. The path part keeps the file name, so that the
// editor selects the language. The query holds the exact values.
export function encodeHeadUri(repoRootUri: string, path: string): URI {
  return new URI()
    .withScheme(HEAD_SCHEME)
    .withPath(`/${path}`)
    .withQuery(JSON.stringify([repoRootUri, path]));
}

export function decodeHeadUri(uri: URI): HeadLocation {
  const [repoRootUri, path] = JSON.parse(uri.query) as [string, string];
  return { repoRootUri, path };
}
