// The OpenCode config entry that starts Playwright MCP against the AI1 agent
// address. The owner pastes it into the OpenCode config.
export function buildMcpConfig(address: string): string {
  const config = {
    mcp: {
      "ai1-browser": {
        type: "local",
        command: ["npx", "-y", "@playwright/mcp@latest", "--cdp-endpoint", address],
        enabled: true,
      },
    },
  };
  return JSON.stringify(config, undefined, 2);
}
