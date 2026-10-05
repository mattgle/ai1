export const CHANGES_SERVICE_PATH = "/services/ai1-changes";

export const ChangesService = Symbol("ChangesService");

export interface FileChangeEntry {
  // The two status characters of `git status --porcelain`, for example " M", "??", "R ",
  // " R" (a rename that `git add -N` reports, R in the second column), "C " (a copy).
  status: string;
  // The path in the working tree, relative to the repository root.
  path: string;
  // For a rename (R in either status column): the path at HEAD. Discarding a
  // rename restores this path and removes `path`.
  sourcePath?: string;
  // For a copy (C in either status column): the path it was copied from.
  // Never used to discard: a copy's own path is a normal added file, and its
  // source has its own row if it changed.
  copyOf?: string;
}

export interface RepoChanges {
  name: string;
  // The `file:` URI of the repository root.
  rootUri: string;
  // Empty for a detached HEAD and for a repository with no commits yet.
  branch: string;
  // True only for a detached HEAD, to tell it apart from a repository with no
  // commits yet: both give an empty `branch`.
  detached?: boolean;
  files: FileChangeEntry[];
}

export interface ChangesService {
  // Returns the repositories that have uncommitted changes, sorted by name.
  // Without changedUris, discover and scan all repositories within maxDepth.
  // With changedUris, update affected cached repositories and return the complete result.
  scan(workspaceRootUris: string[], maxDepth?: number, changedUris?: string[]): Promise<RepoChanges[]>;
  // Returns the content of a file at HEAD. Returns an empty string when HEAD does not have the file.
  readHead(repoRootUri: string, path: string): Promise<string>;
  discardFile(repoRootUri: string, entry: FileChangeEntry): Promise<void>;
  discardAll(repoRootUri: string): Promise<void>;
}
