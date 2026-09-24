import * as assert from "node:assert";
import { buildMcpConfig } from "./mcp-config";

describe("buildMcpConfig", () => {
  it("gives an OpenCode MCP entry that starts Playwright MCP on the agent address", () => {
    const text = buildMcpConfig("http://127.0.0.1:9333/secret/");
    assert.deepStrictEqual(JSON.parse(text), {
      mcp: {
        "ai1-browser": {
          type: "local",
          command: ["npx", "-y", "@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9333/secret/"],
          enabled: true,
        },
      },
    });
  });
});
