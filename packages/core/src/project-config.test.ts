import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "#/project-config";
import {
  fullProjectConfig,
  invalidProjectConfigs,
  validProjectConfigs,
  zodOnlyInvalidProjectConfigs,
} from "#/project-config.fixtures";

async function projectDirWith(content?: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "project-config-"));
  if (content !== undefined) {
    await writeFile(path.join(dir, "ai-db-safety.json"), content);
  }
  return dir;
}

async function loadingError(content?: string): Promise<unknown> {
  const dir = await projectDirWith(content);
  return loadProjectConfig(dir).then(
    () => null,
    (error: unknown) => error,
  );
}

describe("loadProjectConfig", () => {
  it("loads Environments with defaults filled in", async () => {
    const dir = await projectDirWith(JSON.stringify(fullProjectConfig));

    await expect(loadProjectConfig(dir)).resolves.toEqual({
      environments: {
        prod: {
          host: "db.example.com",
          port: 3306,
          database: "app",
          tls: "verify",
          tlsCaPath: "./certs/rds.pem",
        },
        "dev-2": { host: "127.0.0.1", port: 3307, database: "app_dev", tls: "off" },
      },
      unrestrictedEnvironments: ["dev-2"],
      columnAllowlist: { users: { id: "obfuscated" } },
      globalColumnAllowlist: {},
    });
  });

  it.each(validProjectConfigs)("loads a config with $name", async ({ config }) => {
    const dir = await projectDirWith(JSON.stringify(config));

    await expect(loadProjectConfig(dir)).resolves.toBeDefined();
  });

  it("refuses a missing config with CONFIG_MISSING", async () => {
    await expect(loadingError()).resolves.toMatchObject({ code: "CONFIG_MISSING" });
  });
});

describe("loadProjectConfig with an invalid config", () => {
  it("refuses malformed JSON with CONFIG_INVALID", async () => {
    await expect(loadingError("{")).resolves.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it.each([...invalidProjectConfigs, ...zodOnlyInvalidProjectConfigs])(
    "refuses $name with CONFIG_INVALID",
    async ({ config }) => {
      await expect(loadingError(JSON.stringify(config))).resolves.toMatchObject({
        code: "CONFIG_INVALID",
      });
    },
  );
});
