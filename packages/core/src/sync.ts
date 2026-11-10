import { randomBytes } from "node:crypto";
import {
  type AdminCredentials,
  type CredentialStore,
  readAgentCredentials,
  writeAgentCredentials,
} from "#/credential-store";
import type {
  AdminSession,
  AgentTarget,
  DatabaseAdapter,
  ServerSettings,
} from "#/database-adapter";
import { AppError, errorMessage } from "#/errors";

/** The human's answer to a Widening Change prompt, or that they haven't been asked yet. */
export type Approval = "approved" | "declined" | "unanswered";

export interface UnrestrictedSyncInput {
  readonly environment: string;
  readonly server: ServerSettings;
  readonly adminCredentials: AdminCredentials;
  readonly target: AgentTarget;
  readonly credentialStore: CredentialStore;
  /** Looks up the human's answer to the prompt with this text. */
  readonly approvalFor: (prompt: string) => Approval;
}

export type SyncOutcome =
  | { readonly kind: "synced"; readonly notes: readonly string[] }
  | { readonly kind: "needs-approval"; readonly prompt: string };

function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

/** Wraps a Sync error, replacing the Admin username in MySQL's `'user'@'host'` form. */
function syncFailed(error: unknown, adminUser: string): AppError {
  const redact = (text: string): string => text.replaceAll(`'${adminUser}'@`, "'<redacted>'@");
  if (error instanceof AppError) {
    const message = redact(error.message);
    return message === error.message
      ? error
      : new AppError(error.code, message, error.nextStep, { cause: error.cause });
  }
  const message = redact(errorMessage(error));
  return new AppError(
    "SYNC_FAILED",
    `Sync failed: ${message}`,
    "Check the server is reachable and the Admin Credentials have the privileges Sync needs (run `setup`), then query again.",
    { cause: error },
  );
}

async function storeAgentPassword(input: UnrestrictedSyncInput, password: string): Promise<void> {
  await writeAgentCredentials(input.credentialStore, input.server, input.target.agentUser, {
    password,
    database: input.target.database,
    tls: input.server.tls,
  });
}

/** Replaces a lost agent entry without approval, since exposure is unchanged (ADR 0013). */
async function repairAgentEntry(
  session: AdminSession,
  input: UnrestrictedSyncInput,
): Promise<void> {
  const { credentialStore, server, target } = input;
  if ((await readAgentCredentials(credentialStore, server, target.agentUser)) !== null) {
    return;
  }
  const password = generatePassword();
  await session.setAgentUserPassword(target.agentUser, password);
  await storeAgentPassword(input, password);
}

async function applyUnrestricted(
  session: AdminSession,
  input: UnrestrictedSyncInput,
  userExists: boolean,
): Promise<void> {
  const password = generatePassword();
  await (userExists
    ? session.setAgentUserPassword(input.target.agentUser, password)
    : session.createAgentUser(input.target.agentUser, password));
  await storeAgentPassword(input, password);
  await session.grantUnrestricted(input.target);
}

function wideningPrompt({ environment, target, server }: UnrestrictedSyncInput): string {
  return (
    `Approve a Widening Change for the Environment "${environment}"?\n\n` +
    `The agent will be able to read every column of every table in the database ` +
    `"${target.database}" on ${server.host}:${server.port}.`
  );
}

async function syncInSession(
  session: AdminSession,
  input: UnrestrictedSyncInput,
): Promise<SyncOutcome> {
  const applied = await session.readAppliedAccess(input.target);
  if (applied.access === "unrestricted") {
    await repairAgentEntry(session, input);
    return { kind: "synced", notes: [] };
  }

  const prompt = wideningPrompt(input);
  const approval = input.approvalFor(prompt);
  if (approval === "unanswered") {
    return { kind: "needs-approval", prompt };
  }
  if (approval === "declined") {
    return {
      kind: "synced",
      notes: [
        `The widening for the Environment "${input.environment}" was declined, so its access stays at the applied level.`,
      ],
    };
  }
  await applyUnrestricted(session, input, applied.userExists);
  return { kind: "synced", notes: [] };
}

/**
 * Brings an Unrestricted Environment's Agent User in line with the Project Config. Applies the
 * Widening Change only once `approvalFor` says the human approved this exact prompt.
 */
export async function syncUnrestricted(
  adapter: DatabaseAdapter,
  input: UnrestrictedSyncInput,
): Promise<SyncOutcome> {
  const adminUser = input.adminCredentials.user;
  let session;
  try {
    session = await adapter.openAdminSession({ ...input.server, ...input.adminCredentials });
  } catch (error) {
    throw syncFailed(error, adminUser);
  }

  try {
    return await syncInSession(session, input);
  } catch (error) {
    throw syncFailed(error, adminUser);
  } finally {
    await session.close();
  }
}
