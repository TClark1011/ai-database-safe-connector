export interface ConfigFixture {
  readonly name: string;
  readonly config: unknown;
}

export const fullProjectConfig = {
  $schema: "https://example.com/schema.json",
  environments: {
    prod: { host: "db.example.com", database: "app", tlsCaPath: "./certs/rds.pem" },
    "dev-2": { host: "127.0.0.1", port: 3307, database: "app_dev", tls: "off" },
  },
  unrestrictedEnvironments: ["dev-2"],
  columnAllowlist: { users: { id: "obfuscated" } },
};

export const validProjectConfigs: readonly ConfigFixture[] = [
  { name: "every Environment option", config: fullProjectConfig },
  {
    name: "only the required keys",
    config: { environments: { dev: { host: "h", database: "d" } }, columnAllowlist: {} },
  },
  {
    name: "every column access level",
    config: {
      environments: { dev: { host: "h", database: "d", tls: "required" } },
      columnAllowlist: { users: { id: "full", email: "obfuscated", password: "hidden" } },
      globalColumnAllowlist: { created_at: "full", updated_by: "obfuscated" },
    },
  },
];

/** Invalid configs that both the zod schema and the JSON Schema refuse. */
export const invalidProjectConfigs: readonly ConfigFixture[] = [
  {
    name: "an unknown key",
    config: {
      environments: { dev: { host: "h", database: "d" } },
      columnAllowlist: {},
      extra: 1,
    },
  },
  { name: "no Environments", config: { environments: {}, columnAllowlist: {} } },
  {
    name: "an Environment name over 17 characters",
    config: {
      environments: { abcdefghijklmnopqr: { host: "h", database: "d" } },
      columnAllowlist: {},
    },
  },
  {
    name: "an Environment name with uppercase letters",
    config: { environments: { Dev: { host: "h", database: "d" } }, columnAllowlist: {} },
  },
  {
    name: "a duplicate unrestricted Environment",
    config: {
      environments: { dev: { host: "h", database: "d" } },
      unrestrictedEnvironments: ["dev", "dev"],
      columnAllowlist: {},
    },
  },
  {
    name: "an unknown tls mode",
    config: {
      environments: { dev: { host: "h", database: "d", tls: "maybe" } },
      columnAllowlist: {},
    },
  },
  {
    name: "a port out of range",
    config: {
      environments: { dev: { host: "h", database: "d", port: 70_000 } },
      columnAllowlist: {},
    },
  },
  {
    name: "an unknown column access level",
    config: {
      environments: { dev: { host: "h", database: "d" } },
      columnAllowlist: { users: { id: "partial" } },
    },
  },
  {
    name: "a hidden global column",
    config: {
      environments: { dev: { host: "h", database: "d" } },
      columnAllowlist: {},
      globalColumnAllowlist: { email: "hidden" },
    },
  },
  {
    name: "no Column Allowlist",
    config: { environments: { dev: { host: "h", database: "d" } } },
  },
];

/** Invalid configs that only the zod schema refuses, since JSON Schema can't express the rule. */
export const zodOnlyInvalidProjectConfigs: readonly ConfigFixture[] = [
  {
    name: "an unknown unrestricted Environment",
    config: {
      environments: { dev: { host: "h", database: "d" } },
      unrestrictedEnvironments: ["prod"],
      columnAllowlist: {},
    },
  },
];
