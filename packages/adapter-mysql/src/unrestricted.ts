import { type AgentTarget, AppError, type AppliedState } from "@ai-database-safety-experiment/core";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { quoteId } from "#/connection";

const nonexistingGrantErrno = 1141;

// `_` and `%` are wildcards in a grant's database name, so escape them to match only this one.
function grantDatabase(database: string): string {
  return quoteId(database.replaceAll(/[\\_%]/gu, String.raw`\$&`));
}

function grantStatements({ database, agentUser }: AgentTarget): {
  usage: string;
  select: string;
} {
  const grantee = `${quoteId(agentUser)}@\`%\``;
  return {
    usage: `GRANT USAGE ON *.* TO ${grantee}`,
    select: `GRANT SELECT ON ${grantDatabase(database)}.* TO ${grantee}`,
  };
}

function isNonexistingGrant(error: unknown): boolean {
  return error instanceof Error && "errno" in error && error.errno === nonexistingGrantErrno;
}

/**
 * Reads which access the Agent User has from its grants (ADR 0009). Any grant Sync never gives
 * fails Sync rather than being changed.
 */
export async function readAppliedAccess(
  admin: Connection,
  target: AgentTarget,
): Promise<AppliedState> {
  let grants: string[];
  try {
    const [rows] = await admin.query<RowDataPacket[]>("SHOW GRANTS FOR ?@'%'", [target.agentUser]);
    grants = rows.map((row) => String(Object.values(row)[0]));
  } catch (error) {
    if (isNonexistingGrant(error)) {
      return { userExists: false, access: "none" };
    }
    throw error;
  }

  const expected = grantStatements(target);
  const unexpected = grants.filter(
    (grant) => grant !== expected.usage && grant !== expected.select,
  );
  if (unexpected.length > 0) {
    throw new AppError(
      "SYNC_FAILED",
      `The Agent User ${target.agentUser} has grants Sync never gives: ${unexpected.join("; ")}`,
      `Drop the user ${target.agentUser}@'%' with your Admin Credentials, then query again.`,
    );
  }
  return {
    userExists: true,
    access: grants.includes(expected.select) ? "unrestricted" : "none",
  };
}

export async function createAgentUser(
  admin: Connection,
  agentUser: string,
  password: string,
): Promise<void> {
  await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [agentUser, password]);
}

export async function setAgentUserPassword(
  admin: Connection,
  agentUser: string,
  password: string,
): Promise<void> {
  await admin.query("ALTER USER ?@'%' IDENTIFIED BY ?", [agentUser, password]);
}

/** Grants `SELECT ON <database>.*`, and nothing else (ADR 0009). */
export async function grantUnrestricted(admin: Connection, target: AgentTarget): Promise<void> {
  await admin.query(`GRANT SELECT ON ${grantDatabase(target.database)}.* TO ?@'%'`, [
    target.agentUser,
  ]);
}
