import type { ConnectionSettings, CsvValue } from "@ai-database-safety-experiment/core";
import { type TestMysql, useTestMysql } from "@ai-database-safety-experiment/testing";
import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { mysqlAdapter } from "#/index";
import { queryRows } from "#/query-rows.test-support";

interface Fixture {
  readonly test: TestMysql;
  readonly database: string;
  readonly agent: ConnectionSettings;
}

/** A database and an Agent User with SELECT on it. */
async function setUp(): Promise<Fixture> {
  const test = await useTestMysql();
  const database = `${test.prefix}_app`;
  const agentUser = `${test.prefix}_agent`;
  const password = "agent-password-1";
  await test.admin.query(`CREATE DATABASE ${mysql.escapeId(database)}`);
  await test.admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [agentUser, password]);
  await test.admin.query(`GRANT SELECT ON ${mysql.escapeId(database)}.* TO ?@'%'`, [agentUser]);
  return {
    test,
    database,
    agent: {
      host: test.server.host,
      port: test.server.port,
      tls: "off",
      user: agentUser,
      password,
      database,
    },
  };
}

/**
 * Seeds a table `k` and returns a three-way cross join of it: too many rows to read in time, whose
 * first rows still arrive at once.
 */
async function seedCrossJoin(
  admin: TestMysql["admin"],
  database: string,
  select: string,
  hint = "",
): Promise<string> {
  const table = `${mysql.escapeId(database)}.k`;
  await admin.query(`CREATE TABLE ${table} (n INT)`);
  await admin.query(`INSERT INTO ${table} VALUES ?`, [Array.from({ length: 1000 }, (_, n) => [n])]);
  return `SELECT ${hint} ${select} FROM k k0, k k1, k k2`;
}

// Column type, inserted literal, expected text form.
const columnTypeCases: readonly (readonly [string, string, string])[] = [
  ["DATE", "'2026-01-02'", "2026-01-02"],
  ["DATETIME(3)", "'2026-01-02 03:04:05.678'", "2026-01-02 03:04:05.678"],
  ["TIME", "'-01:02:03'", "-01:02:03"],
  ["YEAR", "2026", "2026"],
  ["TINYINT", "-128", "-128"],
  ["SMALLINT", "-32768", "-32768"],
  ["MEDIUMINT", "-8388608", "-8388608"],
  ["INT", "-2147483648", "-2147483648"],
  ["NUMERIC(6,2)", "1234.5", "1234.50"],
  ["DATETIME", "'2026-01-02 03:04:05'", "2026-01-02 03:04:05"],
  ["TINYTEXT", "'tiny'", "tiny"],
  ["MEDIUMTEXT", "'medium'", "medium"],
  ["LONGTEXT", "'long'", "long"],
  ["FLOAT", "1.5", "1.5"],
  ["DOUBLE", "0.1", "0.1"],
  ["BIGINT", "-9223372036854775808", "-9223372036854775808"],
  ["BIGINT UNSIGNED", "18446744073709551615", "18446744073709551615"],
  [
    "DECIMAL(40,20)",
    "'12345678901234567890.12345678901234567890'",
    "12345678901234567890.12345678901234567890",
  ],
  ["BINARY(3)", "0x00ff10", "0x00ff10"],
  ["VARBINARY(10)", "''", "0x"],
  ["BLOB", "0xdeadbeef", "0xdeadbeef"],
  ["TINYBLOB", "0x01", "0x01"],
  ["MEDIUMBLOB", "0x0203", "0x0203"],
  ["LONGBLOB", "0x04", "0x04"],
  ["BIT(12)", "b'101'", "0x0005"],
  ["CHAR(4)", "'ab'", "ab"],
  ["VARCHAR(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", "'Ab'", "Ab"],
  ["ENUM('a', 'b')", "'b'", "b"],
  ["SET('a', 'b')", "'a,b'", "a,b"],
  // MySQL's internal geometry format: a 4-byte SRID, then WKB.
  [
    "GEOMETRY",
    "ST_GeomFromText('POINT(1 2)')",
    "0x000000000101000000000000000000f03f0000000000000040",
  ],
  ["VARCHAR(10)", "'héllo'", "héllo"],
  ["TEXT", "'a, b'", "a, b"],
  [
    "JSON",
    `'{"b": [1, 2.5, "x, y: z"], "a": 18446744073709551615, "c": {"d": null}}'`,
    '{"a":18446744073709551615,"b":[1,2.5,"x, y: z"],"c":{"d":null}}',
  ],
];

describe("value formats", () => {
  it.each(columnTypeCases)("returns %s as its text form", async (type, literal, expected) => {
    const { test, database, agent } = await setUp();
    const table = `${mysql.escapeId(database)}.v`;
    await test.admin.query(`CREATE TABLE ${table} (c ${type})`);
    await test.admin.query(`INSERT INTO ${table} VALUES (${literal})`);

    await expect(queryRows(agent, "SELECT c FROM v")).resolves.toEqual({
      columns: ["c"],
      rows: [[expected]],
    });
  });

  it("returns TIMESTAMP in UTC", async () => {
    const { test, database, agent } = await setUp();
    const table = `${mysql.escapeId(database)}.v`;
    await test.admin.query(`CREATE TABLE ${table} (c TIMESTAMP)`);
    await test.admin.query("SET time_zone = '+10:00'");
    await test.admin.query(`INSERT INTO ${table} VALUES ('2026-01-02 10:00:00')`);

    await expect(queryRows(agent, "SELECT c FROM v")).resolves.toEqual({
      columns: ["c"],
      rows: [["2026-01-02 00:00:00"]],
    });
  });

  it("returns a binary expression as hex and NULL as null", async () => {
    const { agent } = await setUp();

    await expect(
      queryRows(agent, "SELECT CAST('ab' AS BINARY) AS b, NULL AS n, 1.5e0 AS f"),
    ).resolves.toEqual({ columns: ["b", "n", "f"], rows: [["0x6162", null, "1.5"]] });
  });
});

describe("time limit", () => {
  it("stops a query that runs past the time limit", async () => {
    const { test, database, agent } = await setUp();
    const sql = await seedCrossJoin(test.admin, database, "SUM(k0.n)");

    await expect(queryRows(agent, sql, 1)).rejects.toMatchObject({
      code: "QUERY_TIMED_OUT",
    });
  });

  it("kills a query whose MAX_EXECUTION_TIME hint is above the time limit", async () => {
    const { test, database, agent } = await setUp();
    const hint = "/*+ MAX_EXECUTION_TIME(600000) */";
    const sql = await seedCrossJoin(test.admin, database, "SUM(k0.n)", hint);
    const started = Date.now();

    await expect(queryRows(agent, sql, 1)).rejects.toMatchObject({
      code: "QUERY_TIMED_OUT",
    });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("statements", () => {
  it("doesn't keep anything the agent SETs for the next query", async () => {
    const { agent } = await setUp();

    await queryRows(agent, "SET @leak = 1");
    await queryRows(agent, "SET SESSION max_execution_time = 0");

    await expect(
      queryRows(agent, "SELECT @leak AS v, @@session.max_execution_time AS t"),
    ).resolves.toEqual({ columns: ["v", "t"], rows: [[null, "30000"]] });
  });
});

describe("streaming", () => {
  it("stops reading as soon as the sink declines a row", async () => {
    const { test, database, agent } = await setUp();
    const sql = await seedCrossJoin(test.admin, database, "k0.n");
    let columns: readonly string[] = [];
    const offered: (readonly CsvValue[])[] = [];
    const started = Date.now();

    // Without stopping, reading every row would run into the time limit.
    await mysqlAdapter.runReadOnlyQuery(agent, {
      sql,
      timeLimitSeconds: 30,
      sink: {
        columns: (names) => {
          columns = names;
        },
        row: (row) => {
          offered.push(row.decode());
          return false;
        },
      },
    });

    expect({ columns, offered: offered.length }).toEqual({ columns: ["n"], offered: 1 });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("gives each row's raw size before decoding it", async () => {
    const { agent } = await setUp();
    let columns: readonly string[] = [];
    const sizes: number[] = [];

    await mysqlAdapter.runReadOnlyQuery(agent, {
      sql: "SELECT CAST('abc' AS BINARY) AS b, 'héllo' AS t, NULL AS n",
      timeLimitSeconds: 30,
      sink: {
        columns: (names) => {
          columns = names;
        },
        row: (row) => {
          sizes.push(row.rawBytes);
          return true;
        },
      },
    });

    // Three bytes of binary, then "héllo" in UTF-8, whose "é" takes two bytes.
    expect({ columns, sizes }).toEqual({ columns: ["b", "t", "n"], sizes: [9] });
  });
});
