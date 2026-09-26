import { ContextMenuRenderer, Message, ReactWidget } from "@theia/core/lib/browser";
import { Emitter, MessageService } from "@theia/core/lib/common";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import { DownloadEntry, downloadHost, formatBytes } from "../common/downloads";
import { AGENT_PROFILE_ID } from "../common/profiles";
import { browserApi } from "./browser-api";

export const DOWNLOADS_ROW_MENU = ["ai1-downloads-row-menu"];

// The downloads of all browser tabs, newest first. The main process sends
// the full list on each change.
@injectable()
export class DownloadsWidget extends ReactWidget {
  static readonly ID = "ai1-downloads";

  @inject(ContextMenuRenderer)
  protected readonly contextMenu!: ContextMenuRenderer;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  protected entries: DownloadEntry[] | undefined;
  protected readonly changeEmitter = new Emitter<DownloadEntry[]>();
  // The subscriptions end when the widget is disposed.
  readonly onDidChange = this.changeEmitter.event;

  @postConstruct()
  protected init(): void {
    this.id = DownloadsWidget.ID;
    this.title.label = "Downloads";
    this.title.caption = "Downloads";
    this.title.iconClass = "codicon codicon-cloud-download";
    this.title.closable = true;
    this.addClass("ai1-downloads");
    this.toDispose.push(this.changeEmitter);
    const stop = browserApi().onDownloadsChanged((entries) => this.setEntries(entries));
    this.toDispose.push({ dispose: stop });
    this.update();
  }

  // Reads the list again. The main process first marks a completed entry
  // whose file is gone as "deleted".
  async refresh(): Promise<void> {
    const entries = await browserApi().listDownloads();
    if (!this.isDisposed) {
      this.setEntries(entries);
    }
  }

  protected setEntries(entries: DownloadEntry[]): void {
    this.entries = entries;
    this.changeEmitter.fire(entries);
    this.update();
  }

  protected override onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    void this.refresh();
  }

  protected render(): React.ReactNode {
    const entries = this.entries;
    if (entries === undefined) {
      return <div className="ai1-downloads-empty">Reading the downloads…</div>;
    }
    if (entries.length === 0) {
      return <div className="ai1-downloads-empty">There are no downloads.</div>;
    }
    return <div className="ai1-downloads-list">{entries.map((entry) => this.renderRow(entry))}</div>;
  }

  protected renderRow(entry: DownloadEntry): React.ReactNode {
    const host = downloadHost(entry.url);
    const running = entry.state === "progressing";
    const completed = entry.state === "completed";
    return (
      <div
        className={`ai1-downloads-row ai1-downloads-${entry.state}`}
        key={entry.id}
        title={`${entry.fileName}\n${entry.url}`}
        onContextMenu={(event) => {
          event.preventDefault();
          this.contextMenu.render({
            menuPath: DOWNLOADS_ROW_MENU,
            anchor: event.nativeEvent,
            args: [entry],
            context: event.currentTarget,
          });
        }}
      >
        <div className="ai1-downloads-line">
          <span className="ai1-downloads-name">{entry.fileName}</span>
          {entry.profileId === AGENT_PROFILE_ID && <span className="ai1-downloads-agent">Agent</span>}
        </div>
        <div className="ai1-downloads-line ai1-downloads-details">
          {host && <span className="ai1-downloads-host">{host}</span>}
          {this.renderStatus(entry)}
        </div>
        <div className="ai1-downloads-actions">
          {running && (
            <button
              className="theia-button secondary ai1-downloads-cancel"
              onClick={() => void browserApi().cancelDownload(entry.id)}
            >
              Cancel
            </button>
          )}
          {!running && (
            <>
              <button
                className="theia-button secondary ai1-downloads-open"
                disabled={!completed}
                onClick={() => void this.run(browserApi().openDownload(entry.id))}
              >
                Open
              </button>
              <button
                className="theia-button secondary ai1-downloads-show"
                disabled={!completed}
                onClick={() => void this.run(browserApi().showDownload(entry.id))}
              >
                Show in Finder
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  protected renderStatus(entry: DownloadEntry): React.ReactNode {
    switch (entry.state) {
      case "progressing":
        return entry.totalBytes > 0 ? (
          <progress
            className="ai1-downloads-progress"
            value={entry.receivedBytes}
            max={entry.totalBytes}
            title={`${formatBytes(entry.receivedBytes)} of ${formatBytes(entry.totalBytes)}`}
          />
        ) : (
          <span className="ai1-downloads-status">Downloading…</span>
        );
      case "completed":
        return (
          <span className="ai1-downloads-status">
            {formatBytes(entry.receivedBytes)} · {new Date(entry.startTime).toLocaleString()}
          </span>
        );
      case "cancelled":
        return <span className="ai1-downloads-status">Cancelled</span>;
      case "failed":
        return <span className="ai1-downloads-status">Failed: {entry.error ?? "Unknown error."}</span>;
      case "deleted":
        return <span className="ai1-downloads-status">Deleted</span>;
    }
  }

  // Shows the error text of an action when it is not empty.
  protected async run(action: Promise<string>): Promise<void> {
    const error = await action;
    if (error) {
      await this.messages.error(error);
    }
  }
}
