import * as assert from "node:assert";
import { ExpandableTreeNode } from "@theia/core/lib/browser/tree/tree-expansion";
import { SessionGroup } from "../common/agents-protocol";
import { buildRoot, isGroupNode, isSessionNode } from "./agents-tree";

const groups: SessionGroup[] = [
  {
    directory: "/m/alpha",
    name: "alpha",
    sessions: [
      {
        id: "s1",
        directory: "/m/alpha",
        title: "One",
        status: "working",
        model: "m",
        messageCount: 3,
        updatedAt: 20,
      },
      {
        id: "s2",
        directory: "/m/alpha",
        title: "Two",
        status: "idle",
        model: "m",
        messageCount: 0,
        updatedAt: 10,
      },
    ],
  },
];

describe("buildRoot", () => {
  const session = (id: string, parentId?: string) => ({ ...groups[0].sessions[0], id, title: id, parentId });
  const tree = (sessions: ReturnType<typeof session>[], limit = 30, reveal?: string) => {
    const root = buildRoot([{ ...groups[0], sessions }], () => undefined, limit, reveal);
    const group = root.children[0];
    assert.ok(isGroupNode(group));
    return group;
  };

  it("places recent children below their older parent with stable IDs and nested depths", () => {
    // The service lists the newest child before its parent.
    const group = tree([
      session("grandchild", "child"),
      session("other"),
      session("child", "parent"),
      session("parent"),
    ]);
    assert.deepStrictEqual(
      group.children.map((node) => node.session.id),
      ["parent", "other"],
    );
    const parent = group.children[0];
    const child = parent.children[0];
    assert.strictEqual(child.session.id, "child");
    assert.strictEqual(child.depth, 1);
    assert.strictEqual(child.parent, parent);
    assert.strictEqual(child.children[0].depth, 2);
    assert.strictEqual(child.id, "ai1-agents:/m/alpha:child");
  });

  it("keeps a missing parent, self-link, and cycle visible without recursion", () => {
    const group = tree([
      session("orphan", "missing"),
      session("self", "self"),
      session("a", "b"),
      session("b", "a"),
    ]);
    assert.strictEqual(group.children.length, 4);
    assert.ok(group.children.every((node) => node.depth === 0));
    assert.strictEqual(group.children[0].session.parentId, "missing");
  });

  it("marks only sessions with included children as expandable", () => {
    // Use Theia's guard, which also controls the rendered chevron.
    const group = tree([
      session("child", "parent"),
      session("parent"),
      session("orphan", "missing"),
      session("main"),
    ]);
    assert.strictEqual(ExpandableTreeNode.is(group.children[0]), true);
    assert.strictEqual(ExpandableTreeNode.is(group.children[0].children[0]), false);
    assert.strictEqual(ExpandableTreeNode.is(group.children[1]), false);
    assert.strictEqual(ExpandableTreeNode.is(group.children[2]), false);
    const limited = tree([session("child", "parent"), session("parent")], 1);
    assert.strictEqual(ExpandableTreeNode.is(limited.children[0]), false);
  });

  it("counts all nested rows against the visible limit and keeps parents before children", () => {
    const group = tree([session("child", "parent"), session("other"), session("parent")], 2);
    assert.strictEqual(group.children.length, 1);
    assert.strictEqual(group.children[0].session.id, "parent");
    assert.strictEqual(group.children[0].children[0].session.id, "child");
    assert.strictEqual(group.hiddenCount, 1);
  });

  it("reveals an older parent without removing the visible row limit", () => {
    const group = tree([session("new"), session("old"), session("parent", "old")], 2, "parent");
    assert.strictEqual(group.children[0].session.id, "old");
    assert.strictEqual(group.children[0].children[0].session.id, "parent");
    assert.strictEqual(group.hiddenCount, 1);
  });

  it("preserves the saved child expansion state", () => {
    const root = buildRoot(
      [{ ...groups[0], sessions: [session("child", "parent"), session("parent")] }],
      (id) => (id.endsWith(":parent") ? false : undefined),
      30,
    );
    const group = root.children[0];
    assert.ok(isGroupNode(group));
    assert.strictEqual(group.children[0].expanded, false);
  });

  it("makes stable ids from the directory and the session id", () => {
    const root = buildRoot(groups, () => undefined, 30);
    const group = root.children[0];
    assert.ok(isGroupNode(group));
    assert.strictEqual(group.id, "ai1-agents:/m/alpha");
    assert.strictEqual(group.children[0].id, "ai1-agents:/m/alpha:s1");
    assert.ok(isSessionNode(group.children[0]));
  });

  it("expands a group that has a working or blocked session, and keeps a saved state", () => {
    const fresh = buildRoot(groups, () => undefined, 30);
    assert.strictEqual((fresh.children[0] as unknown as { expanded: boolean }).expanded, true);
    const kept = buildRoot(groups, () => false, 30);
    assert.strictEqual((kept.children[0] as unknown as { expanded: boolean }).expanded, false);
  });

  it("limits the visible sessions of a group and records the hidden count", () => {
    const root = buildRoot(groups, () => undefined, 1);
    const group = root.children[0];
    assert.ok(isGroupNode(group));
    assert.strictEqual(group.children.length, 1);
    assert.strictEqual(group.hiddenCount, 1);
  });
});
