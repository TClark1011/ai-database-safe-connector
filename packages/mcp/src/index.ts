import { createKeyringCredentialStore, productName } from "@ai-database-safety-experiment/core";
import { startMcpServer } from "#/server";

startMcpServer({ argv: process.argv.slice(2), credentialStore: createKeyringCredentialStore() });

// stdout carries the MCP protocol, so logs go to stderr.
console.error(`${productName} MCP server running on stdio`);
