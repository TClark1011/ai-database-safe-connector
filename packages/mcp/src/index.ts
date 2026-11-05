import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { adapterId } from "@ai-database-safety-experiment/adapter-mysql";
import { productName } from "@ai-database-safety-experiment/core";

const server = new McpServer({ name: productName, version: "0.0.0" });

await server.connect(new StdioServerTransport());

// stdout carries the MCP protocol, so logs go to stderr.
console.error(`${productName} MCP server running on stdio (adapter: ${adapterId})`);
