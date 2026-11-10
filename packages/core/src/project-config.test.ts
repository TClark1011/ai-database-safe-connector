import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "#/project-config";

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
    const dir = await projectDirWith(
      JSON.stringify({
        $schema: "https://example.com/schema.json",
        environments: {
          prod: { host: "db.example.com", database: "app", tlsCaPath: "./certs/rds.pem" },
          "dev-2": { host: "127.0.0.1", port: 3307, database: "app_dev", tls: "off" },
        },
        unrestrictedEnvironments: ["dev-2"],
        columnAllowlist: { users: { id: "obfuscated" } },
      }),
    );

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

  it("refuses a missing config with CONFIG_MISSING", async () => {
    await expect(loadingError()).resolves.toMatchObject({ code: "CONFIG_MISSING" });
  });
});

describe("loadProjectConfig with an invalid config", () => {
  it.each([
    ["malformed JSON", "{"],
    [
      "an unknown key",
      JSON.stringify({
        environments: { dev: { host: "h", database: "d" } },
        columnAllowlist: {},
        extra: 1,
      }),
    ],
    ["no Environments", JSON.stringify({ environments: {}, columnAllowlist: {} })],
    [
      "an Environment name over 17 characters",
      JSON.stringify({
        environments: { abcdefghijklmnopqr: { host: "h", database: "d" } },
        columnAllowlist: {},
      }),
    ],
    [
      "an Environment name with uppercase letters",
      JSON.stringify({ environments: { Dev: { host: "h", database: "d" } }, columnAllowlist: {} }),
    ],
    [
      "an unknown unrestricted Environment",
      JSON.stringify({
        environments: { dev: { host: "h", database: "d" } },
        unrestrictedEnvironments: ["prod"],
        columnAllowlist: {},
      }),
    ],
    [
      "a duplicate unrestricted Environment",
      JSON.stringify({
        environments: { dev: { host: "h", database: "d" } },
        unrestrictedEnvironments: ["dev", "dev"],
        columnAllowlist: {},
      }),
    ],
    [
      "an unknown tls mode",
      JSON.stringify({
        environments: { dev: { host: "h", database: "d", tls: "maybe" } },
        columnAllowlist: {},
      }),
    ],
  ])("refuses %s with CONFIG_INVALID", async (_case, content) => {
    await expect(loadingError(content)).resolves.toMatchObject({ code: "CONFIG_INVALID" });
  });
});
