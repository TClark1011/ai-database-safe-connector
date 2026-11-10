import type { AdminSession, ConnectionSettings } from "@ai-database-safety-experiment/core";
import { type TestMysql, useTestMysql } from "@ai-database-safety-experiment/testing";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { expect, it, onTestFinished } from "vitest";
import { openConnection } from "#/connection";
import { mysqlAdapter } from "#/index";

const password = "agent-password-1";

interface Fixture {
  readonly test: TestMysql;
  readonly session: AdminSession;
  readonly database: string;
  readonly agentUser: string;
  readonly agent: ConnectionSettings;
}

async function seedDatabase(admin: TestMysql["admin"], database: string): Promise<void> {
  await admin.query(`CREATE DATABASE ${mysql.escapeId(database)}`);
  await admin.query(`CREATE TABLE ${mysql.escapeId(database)}.items (id INT, note VARCHAR(20))`);
  await admin.query(`INSERT INTO ${mysql.escapeId(database)}.items VALUES (1, 'one'), (2, NULL)`);
}

async function setUp(): Promise<Fixture> {
  const test = await useTestMysql();
  const database = `${test.prefix}_app`;
  const agentUser = `${test.prefix}_agent_dev`;
  await seedDatabase(test.admin, database);
  const server = { host: test.server.host, port: test.server.port, tls: "off" } as const;
  const session = await mysqlAdapter.openAdminSession({
    ...server,
    user: "root",
    password: test.server.rootPassword,
  });
  onTestFinished(async () => {
    await session.close();
  });
  return {
    test,
    session,
    database,
    agentUser,
    agent: { ...server, user: agentUser, password, database },
  };
}

/** Sets up an Agent User with the unrestricted grant applied. */
async function setUpGranted(): Promise<Fixture> {
  const fixture = await setUp();
  await fixture.session.createAgentUser(fixture.agentUser, password);
  await fixture.session.grantUnrestricted({
    database: fixture.database,
    agentUser: fixture.agentUser,
  });
  return fixture;
}

it("grants the Agent User exactly SELECT on the database", async () => {
  const { test, database, agentUser } = await setUpGranted();

  const [rows] = await test.admin.query<RowDataPacket[]>("SHOW GRANTS FOR ?@'%'", [agentUser]);
  expect(rows.map((row) => String(Object.values(row)[0]))).toEqual([
    `GRANT USAGE ON *.* TO \`${agentUser}\`@\`%\``,
    `GRANT SELECT ON \`${database.replaceAll("_", String.raw`\_`)}\`.* TO \`${agentUser}\`@\`%\``,
  ]);
});

it("lets the Agent User read the database but not write to it", async () => {
  const { agent } = await setUpGranted();

  await expect(
    mysqlAdapter.runReadOnlyQuery(agent, "SELECT id, note FROM items ORDER BY id"),
  ).resolves.toEqual({
    columns: ["id", "note"],
    rows: [
      ["1", "one"],
      ["2", null],
    ],
  });

  // Outside a read-only transaction, so only the grant stops the write.
  const direct = await openConnection(agent);
  try {
    await expect(direct.query("INSERT INTO items VALUES (3, 'three')")).rejects.toMatchObject({
      code: "ER_TABLEACCESS_DENIED_ERROR",
    });
  } finally {
    await direct.end();
  }
});

it("doesn't treat underscores in the database name as wildcards", async () => {
  const { test, agent } = await setUpGranted();
  const lookalike = `${test.prefix}xapp`;
  await seedDatabase(test.admin, lookalike);

  await expect(
    mysqlAdapter.runReadOnlyQuery(agent, `SELECT id FROM ${mysql.escapeId(lookalike)}.items`),
  ).rejects.toMatchObject({ code: "QUERY_FAILED" });
});

it("reads back an applied grant as unrestricted", async () => {
  const { session, database, agentUser } = await setUp();
  const target = { database, agentUser };

  await expect(session.readAppliedAccess(target)).resolves.toEqual({
    userExists: false,
    access: "none",
  });

  await session.createAgentUser(agentUser, password);
  await expect(session.readAppliedAccess(target)).resolves.toEqual({
    userExists: true,
    access: "none",
  });

  await session.grantUnrestricted(target);
  await expect(session.readAppliedAccess(target)).resolves.toEqual({
    userExists: true,
    access: "unrestricted",
  });
});

it("fails Sync when the Agent User has grants it never gives", async () => {
  const { test, session, database, agentUser } = await setUp();
  await session.createAgentUser(agentUser, password);
  await test.admin.query(`GRANT INSERT ON ${mysql.escapeId(database)}.* TO ?@'%'`, [agentUser]);

  await expect(session.readAppliedAccess({ database, agentUser })).rejects.toMatchObject({
    code: "SYNC_FAILED",
  });
});

it("runs every query in a read-only transaction", async () => {
  const { test, session, database, agentUser, agent } = await setUp();
  await session.createAgentUser(agentUser, password);
  await test.admin.query(`GRANT SELECT, INSERT ON ${mysql.escapeId(database)}.* TO ?@'%'`, [
    agentUser,
  ]);

  const insert = mysqlAdapter.runReadOnlyQuery(agent, "INSERT INTO items VALUES (3, 'three')");

  await expect(insert).rejects.toMatchObject({ code: "QUERY_FAILED" });
  await expect(insert).rejects.toThrow(/READ ONLY transaction/u);
});

it("refuses more than one statement per query", async () => {
  const { agent } = await setUpGranted();

  await expect(mysqlAdapter.runReadOnlyQuery(agent, "SELECT 1; SELECT 2")).rejects.toMatchObject({
    code: "QUERY_FAILED",
  });
});

it("tells the server the client never sends local files", async () => {
  const { test, database } = await setUp();
  await test.admin.query("SET GLOBAL local_infile = 1");
  onTestFinished(async () => {
    await test.admin.query("SET GLOBAL local_infile = 0");
  });
  const root = await openConnection({
    host: test.server.host,
    port: test.server.port,
    tls: "off",
    user: "root",
    password: test.server.rootPassword,
    database,
  });
  onTestFinished(async () => {
    await root.end();
  });

  // Error 3948: loading local data is disabled on the client side.
  await expect(
    root.query("LOAD DATA LOCAL INFILE '/etc/hosts' INTO TABLE items"),
  ).rejects.toMatchObject({ errno: 3948 });
});

it("runs queries in UTC", async () => {
  const { agent } = await setUpGranted();

  await expect(
    mysqlAdapter.runReadOnlyQuery(agent, "SELECT @@session.time_zone AS tz"),
  ).resolves.toEqual({
    columns: ["tz"],
    rows: [["+00:00"]],
  });
});
