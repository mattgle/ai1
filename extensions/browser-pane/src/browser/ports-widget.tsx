import { ContextMenuRenderer, Message, ReactWidget } from "@theia/core/lib/browser";
import { Emitter } from "@theia/core/lib/common";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { PortRow } from "../common/ports";
import { PortsScan, PortsService } from "../common/ports-protocol";
import { DEFAULT_PROFILE_ID } from "../common/profiles";
import { BrowserTabs } from "./browser-tabs";

export const PORTS_ROW_MENU = ["ai1-ports-row-menu"];
const REFRESH_MS = 5000;

export function portAddress(row: PortRow): string {
  return `http://localhost:${row.port}/`;
}

// The servers that listen on this machine, grouped by the repository of
// their working folder. It scans every 5 seconds while it is visible.
@injectable()
export class PortsWidget extends ReactWidget {
  static readonly ID = "ai1-ports";

  @inject(PortsService)
  protected readonly ports!: PortsService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(BrowserTabs)
  protected readonly tabs!: BrowserTabs;

  @inject(ContextMenuRenderer)
  protected readonly contextMenu!: ContextMenuRenderer;

  protected scanResult: PortsScan | undefined;
  protected otherOpen = false;
  protected timer: ReturnType<typeof setInterval> | undefined;
  protected readonly scanEmitter = new Emitter<PortsScan>();
  // The subscriptions end when the widget is disposed.
  readonly onDidScan = this.scanEmitter.event;

  @postConstruct()
  protected init(): void {
    this.id = PortsWidget.ID;
    this.title.label = "Ports";
    this.title.caption = "Ports";
    this.title.iconClass = "codicon codicon-plug";
    this.title.closable = true;
    this.addClass("ai1-ports");
    this.toDispose.push(this.scanEmitter);
    this.toDispose.push(this.workspace.onWorkspaceChanged(() => void this.refresh()));
    this.update();
  }

  async refresh(): Promise<void> {
    const roots = (await this.workspace.roots).map((root) => root.resource.path.fsPath());
    const scan = await this.ports.scan(roots);
    if (this.isDisposed) {
      return;
    }
    this.scanResult = scan;
    this.scanEmitter.fire(scan);
    this.update();
  }

  protected override onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }

  protected override onAfterHide(msg: Message): void {
    super.onAfterHide(msg);
    clearInterval(this.timer);
    this.timer = undefined;
  }

  override dispose(): void {
    clearInterval(this.timer);
    super.dispose();
  }

  protected render(): React.ReactNode {
    const scan = this.scanResult;
    if (scan === undefined) {
      return <div className="ai1-ports-empty">Looking for servers…</div>;
    }
    if (!scan.ok) {
      return (
        <div className="ai1-ports-error">
          <p>{scan.error}</p>
          <button className="theia-button ai1-ports-retry" onClick={() => void this.refresh()}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="ai1-ports-list">
        {scan.groups.length === 0 && (
          <div className="ai1-ports-empty">No server of the workspace listens now.</div>
        )}
        {scan.groups.map((group) => (
          <div className="ai1-ports-group" key={group.path}>
            <div className="ai1-ports-group-name" title={group.path}>
              {group.name}
            </div>
            {group.rows.map((row) => this.renderRow(row))}
          </div>
        ))}
        {scan.other.length > 0 && (
          <div className="ai1-ports-group ai1-ports-other">
            <div
              className="ai1-ports-group-name ai1-ports-toggle"
              onClick={() => {
                this.otherOpen = !this.otherOpen;
                this.update();
              }}
            >
              <span className={`codicon codicon-chevron-${this.otherOpen ? "down" : "right"}`} /> Other (
              {scan.other.length})
            </div>
            {this.otherOpen && scan.other.map((row) => this.renderRow(row))}
          </div>
        )}
      </div>
    );
  }

  protected renderRow(row: PortRow): React.ReactNode {
    return (
      <div
        className="ai1-ports-row"
        key={`${row.pid}:${row.port}`}
        title={`${portAddress(row)} — ${row.program} (process ${row.pid})`}
        onClick={() => void this.tabs.open(portAddress(row), DEFAULT_PROFILE_ID)}
        onContextMenu={(event) => {
          event.preventDefault();
          this.contextMenu.render({
            menuPath: PORTS_ROW_MENU,
            anchor: event.nativeEvent,
            args: [row],
            context: event.currentTarget,
          });
        }}
      >
        <span className="ai1-ports-port">:{row.port}</span>
        <span className="ai1-ports-program">{row.program}</span>
      </div>
    );
  }
}
