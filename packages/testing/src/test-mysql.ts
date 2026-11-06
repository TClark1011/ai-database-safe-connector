import { randomBytes } from "node:crypto";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { inject, onTestFinished } from "vitest";
import type { MysqlServer } from "#/mysql-server";

export interface TestMysql {
  server: MysqlServer;
  /** Prefix every database and user the test creates with this, so they are dropped when it finishes. */
  prefix: string;
  /** Root connection to the test server. */
  admin: Connection;
}

interface SchemaRow extends RowDataPacket {
  readonly name: string;
}

interface UserRow extends RowDataPacket {
  readonly user: string;
  readonly host: string;
}

/**
 * Gives the current test a unique name prefix on the shared MySQL server, and drops every
 * database and user starting with it when the test finishes.
 */
export async function useTestMysql(): Promise<TestMysql> {
  const server = inject("mysql");
  // Hex only, so the prefix has no LIKE wildcards in it.
  const prefix = `t${randomBytes(6).toString("hex")}`;
  const admin = await mysql.createConnection({
    host: server.host,
    port: server.port,
    user: "root",
    password: server.rootPassword,
  });

  onTestFinished(async () => {
    const [schemas] = await admin.query<SchemaRow[]>(
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name LIKE ?",
      [`${prefix}%`],
    );
    const [users] = await admin.query<UserRow[]>(
      "SELECT user, host FROM mysql.user WHERE user LIKE ?",
      [`${prefix}%`],
    );

    const drops: Promise<unknown>[] = [];
    for (const { name } of schemas) {
      drops.push(admin.query(`DROP DATABASE ${mysql.escapeId(name)}`));
    }
    for (const { user, host } of users) {
      drops.push(admin.query("DROP USER ?@?", [user, host]));
    }
    await Promise.all(drops);

    await admin.end();
  });

  return { server, prefix, admin };
}
