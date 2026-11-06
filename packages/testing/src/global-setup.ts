import { MySqlContainer } from "@testcontainers/mysql";
import type { TestProject } from "vitest/node";
import type { MysqlServer } from "#/mysql-server";

// Keep in step with the oldest MySQL version the project supports.
const mysqlImage = "mysql:8.4";

/** Vitest global setup: starts one MySQL container per test run and stops it when the run ends. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new MySqlContainer(mysqlImage).start();

  const server: MysqlServer = {
    host: container.getHost(),
    port: container.getPort(),
    rootPassword: container.getRootPassword(),
  };
  project.provide("mysql", server);

  return async () => {
    await container.stop();
  };
}
