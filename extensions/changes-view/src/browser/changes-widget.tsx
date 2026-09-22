import { Disposable, MessageService } from "@theia/core";
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
import { ChangesService, RepoChanges } from "../common/changes-protocol";
import { discardAllPrompt, discardPrompt, DiscardPrompt, isDeleted, isUntracked, statusBadge } from "../common/git-status";
import { encodeHeadUri } from "../common/head-uri";
import { RefreshSequence } from "../common/refresh-sequence";
import { shouldIgnorePath } from "../common/refresh-filter";
import { buildRoot, FileNode, isFileNode, isRepoNode, RepoNode } from "./changes-tree";

const REFRESH_DEBOUNCE_MS = 500;

@injectable()
export class ChangesWidget extends TreeWidget {
  static readonly ID = "ai1-changes";
  static readonly LABEL = "Changes";

  @inject(ChangesService)
  protected readonly changes!: ChangesService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(FileService)
  protected readonly files!: FileService;

  @inject(OpenerService)
  protected readonly openerService!: OpenerService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  protected refreshTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly sequence = new RefreshSequence();

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
        if (event.changes.some((change) => !shouldIgnorePath(change.resource.path.toString()))) {
          this.scheduleRefresh();
        }
      }),
    );
    this.toDispose.push(this.workspace.onWorkspaceChanged(() => this.scheduleRefresh(0)));
    this.toDispose.push(Disposable.create(() => clearTimeout(this.refreshTimer)));
    this.scheduleRefresh(0);
  }

  // One timer serves all refresh sources, so that a burst of file events gives one scan.
  scheduleRefresh(delay: number = REFRESH_DEBOUNCE_MS): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), delay);
  }

  async refresh(): Promise<void> {
    const token = this.sequence.start();
    let repos: RepoChanges[];
    try {
      const roots = await this.workspace.roots;
      repos = await this.changes.scan(roots.map((root) => root.resource.toString()));
    } catch (error) {
      console.error("ai1-changes: the scan failed", error);
      return;
    }
    if (!this.sequence.isLatest(token) || this.isDisposed) {
      return;
    }
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
    this.scheduleRefresh(0);
  }

  protected override renderTree(model: TreeModel): React.ReactNode {
    const root = model.root;
    if (!CompositeTreeNode.is(root) || root.children.length === 0) {
      return <div className="theia-widget-noInfo">No changes to show. Edited files show here when you save them.</div>;
    }
    return super.renderTree(model);
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
        <div className="ai1-changes-caption ai1-changes-repo" title={new URI(node.repo.rootUri).path.fsPath()}>
          <span className="ai1-changes-name">{node.repo.name}</span>
          <span className="ai1-changes-description">{node.repo.branch || "(detached)"}</span>
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
          {this.renderAction("go-to-file", "Open File", () => this.openFile(node))}
          {this.renderAction("discard", "Discard Changes", () => this.discardFile(node))}
          <span className={`ai1-changes-badge ai1-changes-badge-${badge}`}>{badge}</span>
        </div>
      );
    }
    return null;
  }

  protected renderAction(icon: string, title: string, run: () => void): React.ReactNode {
    const onClick = (event: React.MouseEvent): void => {
      event.stopPropagation();
      run();
    };
    return <span className={`${codicon(icon)} ai1-changes-action`} title={title} onClick={onClick}></span>;
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

  protected openFile(node: FileNode): void {
    open(this.openerService, this.fileUri(node)).catch((error) => this.messages.error(String(error)));
  }

  protected openDiff(node: FileNode): void {
    const working = this.fileUri(node);
    // An untracked file has no HEAD version to compare with.
    if (isUntracked(node.entry)) {
      this.openFile(node);
      return;
    }
    // HEAD has a renamed file under its old path.
    const head = encodeHeadUri(node.repoRootUri, node.entry.sourcePath ?? node.entry.path);
    // A deleted file has no working file. Show the HEAD version alone.
    if (isDeleted(node.entry)) {
      open(this.openerService, head).catch((error) => this.messages.error(String(error)));
      return;
    }
    const label = `${working.path.base} (HEAD ↔ Working)`;
    open(this.openerService, DiffUris.encode(head, working, label)).catch((error) => this.messages.error(String(error)));
  }

  protected async discardFile(node: FileNode): Promise<void> {
    await this.confirmAndRun(discardPrompt(node.entry), () => this.changes.discardFile(node.repoRootUri, node.entry));
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
      this.messages.error(`${prompt.title} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.refresh();
  }
}
