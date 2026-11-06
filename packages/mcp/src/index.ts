import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { adapterId } from "@ai-database-safety-experiment/adapter-mysql";
import { productName } from "@ai-database-safety-experiment/core";

serveStdio(() => new McpServer({ name: productName, version: "0.0.0" }));

// stdout carries the MCP protocol, so logs go to stderr.
console.error(`${productName} MCP server running on stdio (adapter: ${adapterId})`);
