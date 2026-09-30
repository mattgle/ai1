import * as React from "@theia/core/shared/react";
import type { SessionStatus } from "../common/agents-protocol";
import { reconnectingPrefix } from "../common/card-text";

// The three non-tree states of the Agents view -- the load error, the
// empty workspace, and the summary line above a populated tree -- moved
// into plain render functions that import only React (and the pure
// `reconnectingPrefix` helper, itself DOM-free), so this whole module can
// be unit-tested under this project's plain Node mocha run with
// `renderToStaticMarkup`. `AgentsWidget` itself cannot: it extends
// Theia's `TreeWidget`, which needs a DOM to construct (the same finding
// the M2 backlog ledger's item 2 already made for `AgentsModel`). Moving
// the states' own markup here, and having the widget call these functions
// instead of building the JSX inline, is what makes them testable at all.

// The message shown when the global session cap
// (`OpenCodeClient`'s `MAX_SESSIONS`, the spec value) cut off real data.
// Kept as one literal, shared by both places it can show, so they can
// never show a different message for the same fact.
export const SESSION_CAP_MESSAGE =
  "Showing the 200 newest OpenCode sessions of the service. Older sessions are not listed.";

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  working: "Working",
  blocked: "Waiting for permission",
  done: "Done",
  failed: "Failed",
  idle: "Idle",
};

export function renderSessionStatus(status: SessionStatus): React.ReactElement {
  const label = SESSION_STATUS_LABELS[status];
  return (
    <span
      className={`ai1-agents-status ai1-agents-status-${status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {status === "blocked" ? <span aria-hidden="true">?</span> : null}
    </span>
  );
}

export interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

export function renderErrorState(props: ErrorStateProps): React.ReactElement {
  return (
    <div className="theia-widget-noInfo ai1-agents-error">
      <div>{props.error}</div>
      <button className="theia-button ai1-agents-retry" onClick={() => props.onRetry()}>
        Retry
      </button>
    </div>
  );
}

export interface EmptyStateProps {
  connected: boolean;
  truncated: boolean;
}

export function renderEmptyState(props: EmptyStateProps): React.ReactElement {
  return (
    <div className="theia-widget-noInfo">
      {reconnectingPrefix(props.connected)}
      No OpenCode sessions in this workspace.
      {props.truncated ? <div className="ai1-agents-truncated">{SESSION_CAP_MESSAGE}</div> : null}
    </div>
  );
}

export interface SummaryProps {
  connected: boolean;
  truncated: boolean;
  openTerminalsCount: number;
}

// The summary line above the tree, shown once the workspace has at least
// one session to list.
export function renderSummary(props: SummaryProps): React.ReactElement {
  return (
    <React.Fragment>
      <div className="ai1-agents-summary">
        {reconnectingPrefix(props.connected)}
        {props.openTerminalsCount} terminals open
      </div>
      {props.truncated ? <div className="ai1-agents-truncated">{SESSION_CAP_MESSAGE}</div> : null}
    </React.Fragment>
  );
}
