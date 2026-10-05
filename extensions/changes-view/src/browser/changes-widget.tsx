import { CommandService, Disposable, MessageService } from "@theia/core";
import {
  codicon,
  CompositeTreeNode,
  ConfirmDialog,
  ContextMenuRenderer,
  ExpandableTreeNode,
  NodeProps,
  open,
  OpenerService,
  TreeModel,
  TreeNode,
  TreeProps,
  TreeWidget,
} from "@theia/core/lib/browser";
import { DiffUris } from "@theia/core/lib/browser/diff-uris";
import URI from "@theia/core/lib/common/uri";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { Message } from "@theia/core/shared/@lumino/messaging";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import { branchLabel } from "../common/branch-label";
import { ChangesService, RepoChanges } from "../common/changes-protocol";
import {
  discardAllPrompt,
  discardPrompt,
  DiscardPrompt,
  isDeleted,
  isUntracked,
  statusBadge,
} from "../common/git-status";
import { encodeHeadUri } from "../common/head-uri";
import { RefreshGate } from "../common/refresh-gate";
import { RefreshSequence } from "../common/refresh-sequence";
import { RefreshStatus } from "../common/refresh-status";
import { shouldRefreshPath } from "../common/refresh-filter";
import { CHANGES_REFRESH_MODE, normalizeRefreshMode } from "../common/changes-refresh-mode";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { normalizeScanDepth, REPOSITORY_SCAN_DEPTH } from "../common/repository-scan-depth";
import { buildRoot, FileNode, isFileNode, isRepoNode, RepoNode } from "./changes-tree";

const REFRESH_DEBOUNCE_MS = 500;
const MAX_PENDING_CHANGES = 1000;

@injectable()
export class ChangesWidget extends TreeWidget {
  static readonly ID = "ai1-changes";
  static readonly LABEL = "Changes";

  @inject(ChangesService)
  protected readonly changes!: ChangesService;

  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(FileService)
  protected readonly files!: FileService;

  @inject(OpenerService)
  protected readonly openerService!: OpenerService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(CommandService)
  protected readonly commands!: CommandService;

  protected controlClickHandled = false;

  protected refreshTimer: ReturnType<typeof setTimeout> | undefined;
  protected fullRefreshPending = false;
  protected readonly pendingChanges = new Set<string>();
  protected pendingAllRepositories = false;
  protected lastResult: string | undefined;
  protected readonly sequence = new RefreshSequence();
  protected readonly refreshGate = new RefreshGate();
  protected readonly refreshStatus = new RefreshStatus();
  // Set by a failed scan, for example a missing git program. renderTree shows
  // it in place of "No changes to show" until the next scan succeeds.
  protected error: string | undefined;

  constructor(
    @inject(TreeProps) props: TreeProps,
    @inject(TreeModel) model: TreeModel,
    @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
  ) {
    super(props, model, contextMenuRenderer);
  }

  @postConstruct()
  protected override init(): void {
    super.init();
    this.id = ChangesWidget.ID;
    this.title.label = ChangesWidget.LABEL;
    this.title.caption = ChangesWidget.LABEL;
    this.title.iconClass = codicon("git-compare");
    this.title.closable = true;
    this.addClass("ai1-changes");

    this.toDispose.push(
      this.files.onDidFilesChange((event) => {
        const changed = event.changes
          .filter(
            (change) =>
              change.resource.scheme === "file" && shouldRefreshPath(change.resource.path.toString()),
          )
          .map((change) => change.resource.toString());
        if (!changed.length) return;
        this.refreshStatus.invalidate();
        this.update();
        if (this.automaticRefresh()) this.scheduleRefresh(REFRESH_DEBOUNCE_MS, changed);
      }),
    );
    this.toDispose.push(this.workspace.onWorkspaceChanged(() => this.scheduleRefresh(0)));
    this.toDispose.push(
      this.preferences.onPreferenceChanged((change) => {
        if (change.preferenceName === REPOSITORY_SCAN_DEPTH) this.scheduleRefresh(0);
        if (change.preferenceName === CHANGES_REFRESH_MODE) {
          this.update();
          if (this.automaticRefresh()) this.scheduleRefresh(0);
          else if (!this.fullRefreshPending) clearTimeout(this.refreshTimer);
        }
      }),
    );
    this.toDispose.push(Disposable.create(() => clearTimeout(this.refreshTimer)));
    this.scheduleRefresh(0);
  }

  // One timer serves all refresh sources, so that a burst of file events gives one scan.
  protected automaticRefresh(): boolean {
    return normalizeRefreshMode(this.preferences.get(CHANGES_REFRESH_MODE)) === "automatic";
  }

  scheduleRefresh(delay: number = REFRESH_DEBOUNCE_MS, changedUris?: string[]): void {
    if (changedUris === undefined) this.fullRefreshPending = true;
    else if (!this.pendingAllRepositories) {
      for (const uri of changedUris) this.pendingChanges.add(uri);
      if (this.pendingChanges.size > MAX_PENDING_CHANGES) {
        this.pendingChanges.clear();
        this.pendingAllRepositories = true;
      }
    }
    if (!this.fullRefreshPending && (!this.isVisible || !this.automaticRefresh())) return;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    // `refresh()` runs detached from any caller here: catch its promise so a
    // rejection (for example a bug in `runScan` that this method does not
    // already catch) cannot become an unhandled rejection.
    this.refreshTimer = setTimeout(() => {
      this.refresh(false).catch((error) => console.error("ai1-changes: the refresh failed", error));
    }, delay);
  }

  // The in-flight gate: a refresh that arrives while a scan is running does
  // not start its own scan. It only marks that one more scan is needed, which
  // runs once the current scan ends. This keeps a write burst that the
  // debounce does not filter (for example many files under `/lib/`) down to
  // one scan at a time instead of one scan per event. `finally` calls
  // `refreshGate.end()` even when `runScan` throws, so an unexpected error
  // cannot leave the gate locked and the view stuck refusing every refresh.
  async refresh(full = true): Promise<void> {
    if (full) this.fullRefreshPending = true;
    if (!this.fullRefreshPending && (!this.isVisible || !this.automaticRefresh())) return;
    if (!this.refreshGate.start()) {
      return;
    }
    let again = false;
    try {
      const changedUris = this.fullRefreshPending
        ? undefined
        : this.pendingAllRepositories
          ? this.workspace.tryGetRoots().map((root) => root.resource.toString())
          : [...this.pendingChanges];
      this.fullRefreshPending = false;
      this.pendingChanges.clear();
      this.pendingAllRepositories = false;
      await this.runScan(changedUris);
    } finally {
      again = this.refreshGate.end();
    }
    if (again && !this.isDisposed) {
      await this.refresh(false);
    }
  }

  protected async runScan(changedUris?: string[]): Promise<void> {
    const token = this.sequence.start();
    this.refreshStatus.start();
    this.update();
    let repos: RepoChanges[];
    try {
      const roots = await this.workspace.roots;
      await this.preferences.ready;
      const depth = normalizeScanDepth(this.preferences.get(REPOSITORY_SCAN_DEPTH));
      repos = await this.changes.scan(
        roots.map((root) => root.resource.toString()),
        depth,
        changedUris,
      );
    } catch (error) {
      console.error("ai1-changes: the scan failed", error);
      if (this.sequence.isLatest(token) && !this.isDisposed) {
        this.error = error instanceof Error ? error.message : String(error);
        this.refreshStatus.fail(this.error);
        this.update();
      }
      return;
    }
    if (!this.sequence.isLatest(token) || this.isDisposed) {
      return;
    }
    this.refreshStatus.succeed();
    this.update();
    const result = JSON.stringify(repos);
    if (this.error === undefined && result === this.lastResult) return;
    this.lastResult = result;
    this.error = undefined;
    this.model.root = buildRoot(repos, (nodeId) => {
      const previous = this.model.getNode(nodeId);
      return ExpandableTreeNode.is(previous) ? previous.expanded : undefined;
    });
  }

  expandAll(): void {
    const root = this.model.root;
    if (CompositeTreeNode.is(root)) {
      for (const child of root.children) {
        if (ExpandableTreeNode.is(child)) {
          this.model.expandNode(child);
        }
      }
    }
  }

  collapseAll(): void {
    const root = this.model.root;
    if (CompositeTreeNode.is(root)) {
      this.model.collapseAll(root);
    }
  }

  protected override onAfterShow(message: Message): void {
    super.onAfterShow(message);
    if (this.automaticRefresh() && (this.pendingChanges.size || this.pendingAllRepositories))
      this.scheduleRefresh(0, []);
  }

  protected override onBeforeHide(message: Message): void {
    super.onBeforeHide(message);
    if (!this.fullRefreshPending) clearTimeout(this.refreshTimer);
  }

  protected override renderTree(model: TreeModel): React.ReactNode {
    const root = model.root;
    const empty = !CompositeTreeNode.is(root) || root.children.length === 0;
    const status = this.refreshStatus;
    const manual = !this.automaticRefresh();
    const timestamp = status.lastSuccess === undefined ? undefined : new Date(status.lastSuccess);
    const text = status.refreshing
      ? "Refreshing…"
      : timestamp
        ? `Last refreshed ${timestamp.toLocaleTimeString()} · ${((status.durationMs ?? 0) / 1000).toFixed(2)} s`
        : "Not refreshed yet";
    return (
      <>
        <div
          className="ai1-changes-refresh-status"
          role="status"
          aria-live="polite"
          aria-busy={status.refreshing}
        >
          <div title={timestamp?.toISOString()}>
            {text}
            {manual ? " · Manual" : " · Automatic"}
          </div>
          {!status.refreshing && status.stale && (
            <div className="ai1-changes-refresh-warning">Changes may be out of date. Press Refresh.</div>
          )}
          {status.error && <div className="ai1-changes-refresh-warning">Refresh failed: {status.error}</div>}
        </div>
        {empty ? (
          <div className="theia-widget-noInfo">
            {this.error ??
              (manual
                ? "No changes in the last scan. Press Refresh after file saves."
                : "No changes to show. Edited files show here when you save them.")}
          </div>
        ) : (
          super.renderTree(model)
        )}
      </>
    );
  }

  protected override renderIcon(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return <div className={`${codicon("repo")} ai1-changes-repo-icon`}></div>;
    }
    if (isFileNode(node)) {
      return <div className={`${this.labelProvider.getIcon(this.fileUri(node))} file-icon`}></div>;
    }
    return null;
  }

  protected override renderCaption(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return (
        <div
          className="ai1-changes-caption ai1-changes-repo"
          title={new URI(node.repo.rootUri).path.fsPath()}
        >
          <span className="ai1-changes-name">{node.repo.name}</span>
          <span className="ai1-changes-description">{branchLabel(node.repo)}</span>
        </div>
      );
    }
    if (isFileNode(node)) {
      const path = node.entry.path;
      const slash = path.lastIndexOf("/");
      const title = node.entry.sourcePath ? `${path}\nrenamed from ${node.entry.sourcePath}` : path;
      return (
        <div className="ai1-changes-caption ai1-changes-file" title={title}>
          <span className="ai1-changes-name">{path.slice(slash + 1)}</span>
          <span className="ai1-changes-description">{slash >= 0 ? path.slice(0, slash) : ""}</span>
        </div>
      );
    }
    return null;
  }

  protected override renderTailDecorations(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isRepoNode(node)) {
      return (
        <div className="ai1-changes-tail">
          {this.renderAction("discard", "Discard All Changes", () => this.discardAll(node))}
          <span className="ai1-changes-badge">{node.repo.files.length}</span>
        </div>
      );
    }
    if (isFileNode(node)) {
      const badge = statusBadge(node.entry.status);
      return (
        <div className="ai1-changes-tail">
          {this.renderAction("go-to-file", "Open File", (event) => this.openFile(node, event.ctrlKey), true)}
          {this.renderAction("discard", "Discard Changes", () => this.discardFile(node))}
          <span className={`ai1-changes-badge ai1-changes-badge-${badge}`}>{badge}</span>
        </div>
      );
    }
    return null;
  }

  protected renderAction(
    icon: string,
    title: string,
    run: (event: React.MouseEvent) => void,
    controlOpens = false,
  ): React.ReactNode {
    const onClick = (event: React.MouseEvent): void => {
      event.stopPropagation();
      if (!controlOpens || !event.ctrlKey) run(event);
    };
    const stopActivationKey = (event: React.KeyboardEvent): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
      }
    };
    return (
      <button
        type="button"
        className="ai1-changes-action"
        title={title}
        aria-label={title}
        onClick={onClick}
        onMouseDown={controlOpens ? (event) => this.handleControlClick(event, () => run(event)) : undefined}
        onContextMenu={(event) => this.suppressControlContextMenu(event)}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDownCapture={stopActivationKey}
        onKeyUpCapture={stopActivationKey}
      >
        <span className={codicon(icon)} aria-hidden="true" />
      </button>
    );
  }

  protected override createNodeAttributes(
    node: TreeNode,
    props: NodeProps,
  ): React.Attributes & React.HTMLAttributes<HTMLElement> {
    const attributes = super.createNodeAttributes(node, props);
    return {
      ...attributes,
      onMouseDown: (event) => {
        this.controlClickHandled = false;
        if (isFileNode(node) && !(event.target as HTMLElement).closest("button")) {
          this.handleControlClick(event, () => {
            this.model.selectNode(node);
            this.openDiff(node, true);
          });
        }
      },
      onClick: (event) => {
        if (isFileNode(node) && event.ctrlKey) {
          event.stopPropagation();
        } else {
          attributes.onClick?.(event);
        }
      },
      onContextMenu: (event) => {
        if (!this.suppressControlContextMenu(event)) attributes.onContextMenu?.(event);
      },
    };
  }

  protected handleControlClick(event: React.MouseEvent, run: () => void): void {
    this.controlClickHandled = event.ctrlKey && event.button === 0;
    if (this.controlClickHandled) {
      event.preventDefault();
      event.stopPropagation();
      run();
    }
  }

  protected suppressControlContextMenu(event: React.MouseEvent): boolean {
    if (!event.ctrlKey || !this.controlClickHandled) return false;
    event.preventDefault();
    event.stopPropagation();
    this.controlClickHandled = false;
    return true;
  }

  // The base class opens a node on a double click. A file row opens its diff on a single click.
  protected override tapNode(node?: TreeNode): void {
    super.tapNode(node);
    if (isFileNode(node)) {
      this.openDiff(node);
    }
  }

  protected fileUri(node: FileNode): URI {
    return new URI(node.repoRootUri).resolve(node.entry.path);
  }

  protected openResource(uri: URI, zoom = false): void {
    const opened = open(this.openerService, uri);
    const operation = zoom ? this.commands.executeCommand("ai1.center.zoom", opened) : opened;
    operation.catch((error) => this.messages.error(String(error)));
  }

  protected openFile(node: FileNode, zoom = false): void {
    this.openResource(this.fileUri(node), zoom);
  }

  protected openDiff(node: FileNode, zoom = false): void {
    const working = this.fileUri(node);
    // An untracked file has no HEAD version to compare with.
    if (isUntracked(node.entry)) {
      this.openFile(node, zoom);
      return;
    }
    // HEAD has a renamed file under its old path.
    const head = encodeHeadUri(node.repoRootUri, node.entry.sourcePath ?? node.entry.path);
    // A deleted file has no working file. Show the HEAD version alone.
    if (isDeleted(node.entry)) {
      this.openResource(head, zoom);
      return;
    }
    const label = `${working.path.base} (HEAD ↔ Working)`;
    this.openResource(DiffUris.encode(head, working, label), zoom);
  }

  protected async discardFile(node: FileNode): Promise<void> {
    await this.confirmAndRun(discardPrompt(node.entry), () =>
      this.changes.discardFile(node.repoRootUri, node.entry),
    );
  }

  protected async discardAll(node: RepoNode): Promise<void> {
    await this.confirmAndRun(discardAllPrompt(node.repo.name, node.repo.files.length), () =>
      this.changes.discardAll(node.repo.rootUri),
    );
  }

  protected async confirmAndRun(prompt: DiscardPrompt, run: () => Promise<void>): Promise<void> {
    const confirmed = await new ConfirmDialog({ title: prompt.title, msg: prompt.msg, ok: prompt.ok }).open();
    if (!confirmed) {
      return;
    }
    try {
      await run();
    } catch (error) {
      this.messages.error(
        `${prompt.title} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await this.refresh();
  }
}
