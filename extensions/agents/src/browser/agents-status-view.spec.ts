import * as assert from "node:assert";
import { renderToStaticMarkup } from "@theia/core/shared/react-dom/server";
import { renderEmptyState, renderErrorState, renderSummary, SESSION_CAP_MESSAGE } from "./agents-status-view";

// A minimal walk of a plain React element tree (no DOM, no renderer --
// exactly what `renderErrorState` etc. return before anything renders
// them), to find one child by its host tag name. `renderToStaticMarkup`
// strips event handlers from its output, so the only way to prove a
// button's `onClick` prop actually calls the `onRetry` this module was
// given is to read the prop off the element tree directly and call it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findByType(node: any, type: string): any {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (node.type === type) {
    return node;
  }
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findByType(child, type);
    if (found) {
      return found;
    }
  }
  return undefined;
}

describe("renderErrorState", () => {
  it("shows the error text and a Retry button in the markup", () => {
    const markup = renderToStaticMarkup(renderErrorState({ error: "boom", onRetry: () => undefined }));
    assert.ok(markup.includes("boom"));
    assert.ok(markup.includes("Retry"));
    assert.ok(markup.includes("theia-button"));
  });

  it("calls onRetry when the Retry button's onClick prop is called", () => {
    let called = 0;
    const element = renderErrorState({ error: "boom", onRetry: () => (called += 1) });
    const button = findByType(element, "button");
    assert.ok(button, "the element tree must contain a button");
    assert.strictEqual(typeof button.props.onClick, "function");
    button.props.onClick();
    assert.strictEqual(called, 1);
  });
});

describe("renderEmptyState", () => {
  it("shows the reconnecting prefix only when not connected", () => {
    const connected = renderToStaticMarkup(renderEmptyState({ connected: true, truncated: false }));
    assert.ok(!connected.includes("Reconnecting"));
    const disconnected = renderToStaticMarkup(renderEmptyState({ connected: false, truncated: false }));
    assert.ok(disconnected.includes("Reconnecting"));
  });

  it("shows the session-cap message only when truncated", () => {
    const capped = renderToStaticMarkup(renderEmptyState({ connected: true, truncated: true }));
    assert.ok(capped.includes(SESSION_CAP_MESSAGE));
    const notCapped = renderToStaticMarkup(renderEmptyState({ connected: true, truncated: false }));
    assert.ok(!notCapped.includes(SESSION_CAP_MESSAGE));
  });
});

describe("renderSummary", () => {
  it("shows the terminal count, the reconnecting prefix, and the cap message together", () => {
    const markup = renderToStaticMarkup(
      renderSummary({ connected: false, truncated: true, openTerminalsCount: 3 }),
    );
    assert.ok(markup.includes("Reconnecting"));
    assert.ok(markup.includes("3 terminals open"));
    assert.ok(markup.includes(SESSION_CAP_MESSAGE));
  });

  it("shows neither the reconnecting prefix nor the cap message when connected and not truncated", () => {
    const markup = renderToStaticMarkup(
      renderSummary({ connected: true, truncated: false, openTerminalsCount: 0 }),
    );
    assert.ok(!markup.includes("Reconnecting"));
    assert.ok(!markup.includes(SESSION_CAP_MESSAGE));
    assert.ok(markup.includes("0 terminals open"));
  });
});
