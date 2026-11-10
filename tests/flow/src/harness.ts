import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { onTestFinished } from "vitest";
import * as z from "zod";

const fakeMcpBundle = path.join(import.meta.dirname, "..", "dist", "fake-mcp.mjs");

export interface ElicitationRequest {
  readonly message: string;
  readonly requestedSchema?: unknown;
}

export type ElicitationAnswer =
  | { readonly action: "accept"; readonly content: Readonly<Record<string, boolean>> }
  | { readonly action: "decline" }
  | { readonly action: "cancel" };

export interface McpOptions {
  /** Passed as `--project-dir`; omitted when undefined. */
  readonly projectDir: string | undefined;
  /** Initial fake keychain entries, by key. */
  readonly credentials: Readonly<Record<string, string>>;
  /** The global git email, or null for none. */
  readonly gitEmail: string | null;
  /** Answers every elicitation, standing in for the human. */
  readonly answer: (request: ElicitationRequest) => ElicitationAnswer;
  /** The protocol revision to connect with; defaults to the one Claude Code uses. */
  readonly protocol?: "2026-07-28" | "legacy";
}

export interface QueryOutcome {
  readonly isError: boolean;
  readonly texts: readonly string[];
}

export interface McpSession {
  readonly elicitations: readonly ElicitationRequest[];
  /** Calls the `query` tool and returns the text of each content block, and whether it failed. */
  query: (environment: string, sql: string) => Promise<QueryOutcome>;
}

interface TextBlock {
  readonly type: string;
  readonly text?: string;
}

export function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "flow-"));
}

/** Writes the fake keychain and global git config, returning the environment that points at them. */
async function writeProcessFiles(options: McpOptions): Promise<Record<string, string>> {
  const dir = await makeTempDir();
  const credentialsFile = path.join(dir, "credentials.json");
  await writeFile(credentialsFile, JSON.stringify(options.credentials));
  const gitConfig = path.join(dir, "gitconfig");
  await writeFile(
    gitConfig,
    options.gitEmail === null ? "" : `[user]\n\temail = ${options.gitEmail}\n`,
  );
  return {
    ...getDefaultEnvironment(),
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    FLOW_TEST_CREDENTIALS_FILE: credentialsFile,
  };
}

const elicitationRequestSchema = z.object({
  message: z.string(),
  requestedSchema: z.unknown(),
});

function createClient(
  options: McpOptions,
  onElicitation: (request: ElicitationRequest) => void,
): Client {
  const client = new Client(
    { name: "flow-test", version: "0.0.0" },
    {
      capabilities: { elicitation: { form: {} } },
      ...(options.protocol === "legacy"
        ? {}
        : { versionNegotiation: { mode: { pin: options.protocol ?? "2026-07-28" } } }),
    },
  );
  client.setRequestHandler("elicitation/create", ({ params }: Readonly<{ params: unknown }>) => {
    const request = elicitationRequestSchema.parse(params);
    onElicitation(request);
    return options.answer(request);
  });
  return client;
}

/**
 * Starts the MCP bundle over stdio with a fake keychain, and connects a test client that answers
 * elicitations through `answer`. The process stops when the test finishes.
 */
export async function startMcp(options: McpOptions): Promise<McpSession> {
  const elicitations: ElicitationRequest[] = [];
  const client = createClient(options, (request) => {
    elicitations.push(request);
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      fakeMcpBundle,
      ...(options.projectDir === undefined ? [] : ["--project-dir", options.projectDir]),
    ],
    env: await writeProcessFiles(options),
    stderr: "ignore",
  });
  await client.connect(transport);
  onTestFinished(async () => {
    await client.close();
  });

  return {
    elicitations,
    query: async (environment, sql) => {
      const result = await client.callTool(
        { name: "query", arguments: { environment, sql } },
        { timeout: 30_000 },
      );
      const content = (result.content ?? []) as readonly TextBlock[];
      return {
        isError: result.isError === true,
        texts: content.flatMap((block: TextBlock) =>
          block.type === "text" ? [block.text ?? ""] : [],
        ),
      };
    },
  };
}
