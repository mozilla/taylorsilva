export function getMcpServers(): Record<string, unknown> {
  const url = process.env.MOZ_MCP_URL ?? "https://mcp-dev.moz.tools/mcp";
  return {
    moz: {
      type: "http",
      url,
    },
  };
}
