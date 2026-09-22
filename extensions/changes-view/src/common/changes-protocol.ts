export const CHANGES_SERVICE_PATH = "/services/ai1-changes";

export const ChangesService = Symbol("ChangesService");

export interface FileChangeEntry {
  // The two status characters of `git status --porcelain`, for example " M", "??", "R ".
  status: string;
  // The path in the working tree, relative to the repository root.
  path: string;
  // For a rename or a copy: the path at HEAD.
  sourcePath?: string;
}

export interface RepoChanges {
  name: string;
  // The `file:` URI of the repository root.
  rootUri: string;
  branch: string;
  files: FileChangeEntry[];
}

export interface ChangesService {
  // Returns the repositories that have uncommitted changes, sorted by name.
  scan(workspaceRootUris: string[]): Promise<RepoChanges[]>;
  // Returns the content of a file at HEAD. Returns an empty string when HEAD does not have the file.
  readHead(repoRootUri: string, path: string): Promise<string>;
  discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void>;
  discardAll(repoRootUri: string): Promise<void>;
}
