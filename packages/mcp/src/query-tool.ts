import { readFile } from "node:fs/promises";
import path from "node:path";
import { mysqlAdapter } from "@ai-database-safety-experiment/adapter-mysql";
import {
  type AdminCredentials,
  type AgentTarget,
  AppError,
  type Approval,
  type CappedCsvResult,
  type CredentialStore,
  type EnvironmentConfig,
  type ServerSettings,
  agentUserName,
  createCappedCsv,
  formatCount,
  formatError,
  loadProjectConfig,
  projectConfigFileName,
  queryLimits,
  readAdminCredentials,
  readAgentCredentials,
  readGlobalGitEmail,
  syncUnrestricted,
} from "@ai-database-safety-experiment/core";
import {
  type CallToolResult,
  type InputRequiredResult,
  type McpServer,
  type RequestStateCodec,
  type ServerContext,
  acceptedContent,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import * as z from "zod";

export interface ApprovalState {
  /** The prompt the human was shown, so an answer only approves that exact Widening Change. */
  readonly prompt: string;
}

export interface QueryToolOptions {
  readonly projectDir: string | undefined;
  readonly credentialStore: CredentialStore;
  readonly requestState: RequestStateCodec<ApprovalState>;
}

const approvalKey = "approval";

const approvalSchema = z.object({
  approve: z.boolean().describe("Allow this Widening Change"),
});

const inputSchema = z.object({
  environment: z.string().describe(`An Environment name from ${projectConfigFileName}`),
  sql: z.string().describe("One SQL statement, with unqualified table names"),
});

type QueryArgs = Readonly<z.output<typeof inputSchema>>;

function approvalFrom(ctx: ServerContext, prompt: string): Approval {
  const answer = inputResponse(ctx.mcpReq.inputResponses, approvalKey);
  if (answer.kind === "missing" || ctx.mcpReq.requestState<ApprovalState>()?.prompt !== prompt) {
    return "unanswered";
  }
  const content = acceptedContent(ctx.mcpReq.inputResponses, approvalKey, approvalSchema);
  return content?.approve === true ? "approved" : "declined";
}

async function serverSettings(
  projectDir: string,
  environment: EnvironmentConfig,
): Promise<ServerSettings> {
  const base = { host: environment.host, port: environment.port, tls: environment.tls };
  if (environment.tlsCaPath === undefined) {
    return base;
  }
  const caPath = path.resolve(projectDir, environment.tlsCaPath);
  try {
    return { ...base, tlsCa: await readFile(caPath, "utf8") };
  } catch (error) {
    throw new AppError(
      "CONFIG_INVALID",
      `Can't read the tlsCaPath file ${caPath}.`,
      `Fix tlsCaPath in ${projectConfigFileName}.`,
      { cause: error },
    );
  }
}

/** Text blocks: the main block, then a notes block when there are notes. */
function textBlocks(main: string, notes: readonly string[]): CallToolResult["content"] {
  const blocks = notes.length > 0 ? [main, notes.join("\n")] : [main];
  return blocks.map((block) => ({ type: "text", text: block }));
}

function successResult(csv: string, notes: readonly string[]): CallToolResult {
  return { content: textBlocks(csv, notes) };
}

function errorResult(error: unknown, notes: readonly string[]): CallToolResult {
  return { isError: true, content: textBlocks(formatError(error), notes) };
}

interface QueryTarget {
  readonly server: ServerSettings;
  readonly target: AgentTarget;
  readonly adminCredentials: AdminCredentials;
}

/** Resolves everything the query needs from the Project Config, git and the keychain. */
async function resolveTarget(
  { projectDir, credentialStore }: QueryToolOptions,
  name: string,
): Promise<QueryTarget> {
  if (projectDir === undefined) {
    throw new AppError(
      "CONFIG_MISSING",
      "The MCP server was started without --project-dir.",
      "Pass --project-dir with the project root in the MCP server's config.",
    );
  }

  const config = await loadProjectConfig(projectDir);
  const environment = Object.hasOwn(config.environments, name)
    ? config.environments[name]
    : undefined;
  if (environment === undefined) {
    throw new AppError(
      "UNKNOWN_ENVIRONMENT",
      `"${name}" is not an Environment in ${projectConfigFileName}.`,
      `Use one of: ${Object.keys(config.environments).join(", ")}.`,
    );
  }
  if (!config.unrestrictedEnvironments.includes(name)) {
    throw new AppError(
      "RESTRICTED_ENVIRONMENT_UNSUPPORTED",
      `"${name}" is a restricted Environment, which this version can't query yet.`,
      "Query an Unrestricted Environment instead.",
    );
  }

  const agentUser = agentUserName(await readGlobalGitEmail(), name);
  const server = await serverSettings(projectDir, environment);
  return {
    server,
    target: { database: environment.database, agentUser },
    adminCredentials: await readAdminCredentials(credentialStore, server),
  };
}

async function queryAsAgent(
  credentialStore: CredentialStore,
  environment: string,
  { server, target }: QueryTarget,
  sql: string,
): Promise<CappedCsvResult> {
  const agent = await readAgentCredentials(credentialStore, server, target.agentUser);
  if (agent === null) {
    throw new AppError(
      "NO_AGENT_ACCESS",
      `The agent has no access to the Environment "${environment}" yet.`,
      "Query again and ask the human to approve the widening.",
    );
  }
  const csv = createCappedCsv();
  await mysqlAdapter.runReadOnlyQuery(
    { ...server, user: target.agentUser, password: agent.password, database: target.database },
    { sql, timeLimitSeconds: queryLimits.timeLimitSeconds, sink: csv },
  );
  return csv.result();
}

async function runQuery(
  options: QueryToolOptions,
  args: QueryArgs,
  ctx: ServerContext,
): Promise<CallToolResult | InputRequiredResult> {
  const resolved = await resolveTarget(options, args.environment);
  const sync = await syncUnrestricted(mysqlAdapter, {
    environment: args.environment,
    server: resolved.server,
    adminCredentials: resolved.adminCredentials,
    target: resolved.target,
    credentialStore: options.credentialStore,
    approvalFor: (prompt) => approvalFrom(ctx, prompt),
  });
  if (sync.kind === "needs-approval") {
    return inputRequired({
      inputRequests: {
        [approvalKey]: inputRequired.elicit({
          message: sync.prompt,
          requestedSchema: approvalSchema,
        }),
      },
      requestState: await options.requestState.mint({ prompt: sync.prompt }),
    });
  }

  try {
    const { csv, notes } = await queryAsAgent(
      options.credentialStore,
      args.environment,
      resolved,
      args.sql,
    );
    return successResult(csv, [...sync.notes, ...notes]);
  } catch (error) {
    return errorResult(error, sync.notes);
  }
}

/** Registers the `query` tool (ADR 0014). */
export function registerQueryTool(server: McpServer, options: QueryToolOptions): void {
  server.registerTool(
    "query",
    {
      title: "Query the database",
      description:
        `Run one read-only SQL statement against an Environment from ${projectConfigFileName} ` +
        "and get the rows back as CSV. An unquoted empty field is NULL. Results stop at " +
        `${formatCount(queryLimits.maxRows)} rows or ` +
        `${formatCount(queryLimits.maxCharacters)} characters, and queries at ` +
        `${queryLimits.timeLimitSeconds} seconds.`,
      inputSchema,
    },
    async (args: QueryArgs, ctx: ServerContext) => {
      try {
        return await runQuery(options, args, ctx);
      } catch (error) {
        return errorResult(error, []);
      }
    },
  );
}
