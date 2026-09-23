import * as assert from "node:assert";
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
