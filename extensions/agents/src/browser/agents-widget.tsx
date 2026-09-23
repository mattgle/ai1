import {
  codicon,
  CompositeTreeNode,
  ContextMenuRenderer,
  ExpandableTreeNode,
  NodeProps,
  TreeModel,
  TreeNode,
  TreeProps,
  TreeWidget,
} from "@theia/core/lib/browser";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { Message } from "@theia/core/shared/@lumino/messaging";
import { SessionStatus } from "../common/agents-protocol";
import { cardThirdLine, oneLine } from "../common/card-text";
import { clampVisiblePerGroup, DEFAULT_VISIBLE_PER_GROUP } from "../common/visible-per-group";
import { AgentsModel } from "./agents-model";
import { VISIBLE_PER_GROUP } from "./agents-preferences";
import { buildRoot, GroupNode, isGroupNode, isSessionNode, SessionNode } from "./agents-tree";

const STATUS_ICON: Record<SessionStatus, string> = {
  working: "sync",
  blocked: "warning",
  done: "check",
  failed: "error",
  idle: "circle-outline",
};

@injectable()
export class AgentsWidget extends TreeWidget {
  static readonly ID = "ai1-agents";
  static readonly LABEL = "Agents";

  @inject(AgentsModel)
  protected readonly agents!: AgentsModel;

  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  onOpenSession: (node: SessionNode) => void = () => undefined;
  onNewSession: (directory: string) => void = () => undefined;
  onDeleteSession: (node: SessionNode) => void = () => undefined;
  visiblePerGroup = DEFAULT_VISIBLE_PER_GROUP;

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
    this.id = AgentsWidget.ID;
    this.title.label = AgentsWidget.LABEL;
    this.title.caption = AgentsWidget.LABEL;
    this.title.iconClass = codicon("hubot");
    this.title.closable = true;
    this.addClass("ai1-agents");
    this.visiblePerGroup = clampVisiblePerGroup(this.preferences.get(VISIBLE_PER_GROUP));
    this.toDispose.push(
      this.preferences.onPreferenceChanged((change) => {
        if (change.preferenceName === VISIBLE_PER_GROUP) {
          this.visiblePerGroup = clampVisiblePerGroup(this.preferences.get(VISIBLE_PER_GROUP));
          this.rebuild();
        }
      }),
    );
    this.toDispose.push(this.agents.onDidChange(() => this.rebuild()));
    this.startLoad();
  }

  protected rebuild(): void {
    if (this.isDisposed) {
      return;
    }
    this.model.root = buildRoot(
      this.agents.groups,
      (id) => {
        const previous = this.model.getNode(id);
        return ExpandableTreeNode.is(previous) ? previous.expanded : undefined;
      },
      this.visiblePerGroup,
    );
  }

  protected override onAfterShow(message: Message): void {
    super.onAfterShow(message);
    this.startLoad();
  }

  // Fires a load and forgets it, the two places above that just want a
  // fresh load to start: `AgentsModel.load()` can throw on an unexpected
  // bug in the loading pipeline (see `runGatedOnce`), so this catches
  // that here -- nothing calls this expecting an answer back, and a
  // caught rejection cannot become an unhandled one.
  protected startLoad(): void {
    this.agents.load().catch((error) => {
      console.error(`ai1-agents: the load failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  protected override renderTree(model: TreeModel): React.ReactNode {
    if (this.agents.error) {
      return <div className="theia-widget-noInfo ai1-agents-error">{this.agents.error}</div>;
    }
    const root = model.root;
    if (!CompositeTreeNode.is(root) || root.children.length === 0) {
      return <div className="theia-widget-noInfo">No OpenCode sessions in this workspace.</div>;
    }
    return (
      <React.Fragment>
        <div className="ai1-agents-summary">
          {this.agents.connected ? "" : "Reconnecting… "}
          {this.agents.openTerminals.size} terminals open
        </div>
        {super.renderTree(model)}
      </React.Fragment>
    );
  }

  protected override renderIcon(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isGroupNode(node)) {
      return <div className={`${codicon("repo")} ai1-agents-group-icon`}></div>;
    }
    if (isSessionNode(node)) {
      const status = node.session.status;
      // `codicon-modifier-spin`, not the `~spin` suffix, is the class that
      // `codicon-modifiers.css` keys its spin animation on: `codicon("sync~spin")`
      // makes one class, `codicon-sync~spin`, that no codicon rule matches, so
      // the icon renders with no glyph and a 0×0 box.
      const spin = status === "working" ? " codicon-modifier-spin" : "";
      return (
        <div
          className={`${codicon(STATUS_ICON[status])}${spin} ai1-agents-status ai1-agents-status-${status}`}
        ></div>
      );
    }
    return null;
  }

  protected override renderCaption(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isGroupNode(node)) {
      return this.renderGroup(node);
    }
    if (isSessionNode(node)) {
      return this.renderCard(node);
    }
    return null;
  }

  protected renderGroup(node: GroupNode): React.ReactNode {
    const hidden = node.hiddenCount > 0 ? ` (+${node.hiddenCount} older)` : "";
    return (
      <div className="ai1-agents-caption ai1-agents-group" title={node.group.directory}>
        <span className="ai1-agents-name">{node.group.name}</span>
        <span className="ai1-agents-description">{hidden}</span>
      </div>
    );
  }

  protected renderCard(node: SessionNode): React.ReactNode {
    const session = node.session;
    void this.agents.ensureLastMessage(session.id);
    const last = this.agents.lastMessageOf(session.id);
    return (
      <div className="ai1-agents-caption ai1-agents-card" title={session.title}>
        <div className="ai1-agents-title">{oneLine(session.title, 80)}</div>
        {last ? <div className="ai1-agents-last">{oneLine(last, 120)}</div> : null}
        <div className="ai1-agents-meta">
          {cardThirdLine(session.messageCount, session.updatedAt, session.model, Date.now())}
        </div>
      </div>
    );
  }

  protected override renderTailDecorations(node: TreeNode, _props: NodeProps): React.ReactNode {
    if (isGroupNode(node)) {
      return (
        <div className="ai1-agents-tail">
          {this.renderAction("add", "New session", () => this.onNewSession(node.group.directory))}
          <span className="ai1-agents-badge">{node.group.sessions.length}</span>
        </div>
      );
    }
    if (isSessionNode(node)) {
      return (
        <div className="ai1-agents-tail">
          {this.renderAction("terminal", "Open terminal", () => this.onOpenSession(node))}
          {this.renderAction("trash", "Delete session", () => this.onDeleteSession(node))}
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
    return <span className={`${codicon(icon)} ai1-agents-action`} title={title} onClick={onClick}></span>;
  }

  // A single click on a card opens its terminal.
  protected override tapNode(node?: TreeNode): void {
    super.tapNode(node);
    if (isSessionNode(node)) {
      this.onOpenSession(node);
    }
  }
}
