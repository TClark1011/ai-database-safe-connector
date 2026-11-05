import { defineConfig } from "vitest/config";

const sourceDirs = ["packages/*/src", "plugins/*/src"];
const mysqlGlobalSetup = "packages/testing/src/global-setup.ts";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "process",
          include: sourceDirs.map((dir) => `${dir}/**/*.test.ts`),
          exclude: ["**/*.infra.test.ts"],
        },
      },
      {
        test: {
          name: "infra",
          include: sourceDirs.map((dir) => `${dir}/**/*.infra.test.ts`),
          globalSetup: [mysqlGlobalSetup],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "flow",
          include: ["tests/flow/src/**/*.test.ts"],
          globalSetup: [mysqlGlobalSetup],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
