import { writeFile } from "node:fs/promises";
import path from "node:path";
import { adminCredentialKey, agentUserName } from "@ai-database-safety-experiment/core";
import { type TestMysql, useTestMysql } from "@ai-database-safety-experiment/testing";
import { onTestFinished } from "vitest";
import { type ElicitationAnswer, type McpOptions, makeTempDir } from "#/harness";

export const approve: ElicitationAnswer = { action: "accept", content: { approve: true } };

export interface Fixture {
  readonly test: TestMysql;
  readonly projectDir: string;
  readonly database: string;
  readonly gitEmail: string;
  readonly adminKey: string;
  readonly adminEntry: string;
}

export async function writeConfig(projectDir: string, config: unknown): Promise<void> {
  await writeFile(path.join(projectDir, "ai-db-safety.json"), JSON.stringify(config));
}

/** A database with an `items` table, and a Project Config with it as the Unrestricted Environment `dev`. */
export async function setUp(): Promise<Fixture> {
  const test = await useTestMysql();
  const database = `${test.prefix}_app`;
  await test.admin.query(`CREATE DATABASE \`${database}\``);
  await test.admin.query(`CREATE TABLE \`${database}\`.items (id INT, note VARCHAR(20))`);
  await test.admin.query(`INSERT INTO \`${database}\`.items VALUES (1, 'one'), (2, NULL), (3, '')`);

  const gitEmail = `${test.prefix}@example.com`;
  // The Agent User isn't named with the test prefix, so drop it here.
  const agentUser = agentUserName(gitEmail, "dev");
  onTestFinished(async () => {
    await test.admin.query("DROP USER IF EXISTS ?@'%'", [agentUser]);
  });

  const projectDir = await makeTempDir();
  await writeConfig(projectDir, {
    environments: {
      dev: { host: test.server.host, port: test.server.port, database, tls: "off" },
    },
    unrestrictedEnvironments: ["dev"],
    columnAllowlist: {},
  });

  return {
    test,
    projectDir,
    database,
    gitEmail,
    adminKey: adminCredentialKey(test.server),
    adminEntry: JSON.stringify({ user: "root", password: test.server.rootPassword }),
  };
}

/** Options for `startMcp` with the fixture's Admin Credentials, approving every widening. */
export function mcpOptions(
  fixture: Pick<Fixture, "projectDir" | "adminKey" | "adminEntry" | "gitEmail">,
  overrides: Partial<McpOptions> = {},
): McpOptions {
  return {
    projectDir: fixture.projectDir,
    credentials: { [fixture.adminKey]: fixture.adminEntry },
    gitEmail: fixture.gitEmail,
    answer: () => approve,
    ...overrides,
  };
}
