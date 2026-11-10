import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { type CredentialStore, productName } from "@ai-database-safety-experiment/core";
import { McpServer, createRequestStateCodec } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { type ApprovalState, registerQueryTool } from "#/query-tool";

export interface StartMcpServerOptions {
  /** Command-line arguments, without the node and script paths. */
  readonly argv: readonly string[];
  readonly credentialStore: CredentialStore;
}

/** Serves the MCP over stdio. Without `--project-dir`, every query is refused. */
export function startMcpServer({ argv, credentialStore }: StartMcpServerOptions): void {
  const { values } = parseArgs({
    args: [...argv],
    options: { "project-dir": { type: "string" } },
    strict: false,
    allowPositionals: true,
  });
  const projectDir = values["project-dir"];

  // Only this process mints and verifies request state, so a per-process key is enough.
  const requestState = createRequestStateCodec<ApprovalState>({ key: randomBytes(32) });

  serveStdio(() => {
    const server = new McpServer(
      { name: productName, version: "0.0.0" },
      { requestState: { verify: (state, ctx) => requestState.verify(state, ctx) } },
    );
    registerQueryTool(server, {
      projectDir: typeof projectDir === "string" ? projectDir : undefined,
      credentialStore,
      requestState,
    });
    return server;
  });
}
