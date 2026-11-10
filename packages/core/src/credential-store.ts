import * as z from "zod";
import type { ServerAddress } from "#/database-adapter";
import { AppError } from "#/errors";
import { tlsModeSchema } from "#/project-config";

/** Secret storage keyed by connection (ADR 0013). Values are opaque strings. */
export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const adminCredentialsSchema = z.strictObject({ user: z.string(), password: z.string() });
export type AdminCredentials = z.output<typeof adminCredentialsSchema>;

const agentCredentialsSchema = z.strictObject({
  password: z.string(),
  database: z.string(),
  tls: tlsModeSchema,
});
export type AgentCredentials = z.output<typeof agentCredentialsSchema>;

export function adminCredentialKey({ host, port }: ServerAddress): string {
  return `admin:${host.toLowerCase()}:${port}`;
}

export function agentCredentialKey({ host, port }: ServerAddress, agentUser: string): string {
  return `agent:${host.toLowerCase()}:${port}:${agentUser}`;
}

function parseEntry<T>(schema: z.ZodType<T>, key: string, value: string): T {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    json = undefined;
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AppError(
      "SYNC_FAILED",
      `The keychain entry "${key}" is unreadable.`,
      "Run `setup` again for this server.",
    );
  }
  return result.data;
}

export async function readAdminCredentials(
  store: CredentialStore,
  server: ServerAddress,
): Promise<AdminCredentials> {
  const key = adminCredentialKey(server);
  const value = await store.get(key);
  if (value === null) {
    throw new AppError(
      "ADMIN_CREDENTIALS_MISSING",
      `No Admin Credentials are stored for ${server.host.toLowerCase()}:${server.port}.`,
      "Run `setup` in your own terminal to store them.",
    );
  }
  return parseEntry(adminCredentialsSchema, key, value);
}

export async function readAgentCredentials(
  store: CredentialStore,
  server: ServerAddress,
  agentUser: string,
): Promise<AgentCredentials | null> {
  const key = agentCredentialKey(server, agentUser);
  const value = await store.get(key);
  return value === null ? null : parseEntry(agentCredentialsSchema, key, value);
}

export async function writeAgentCredentials(
  store: CredentialStore,
  server: ServerAddress,
  agentUser: string,
  credentials: Readonly<AgentCredentials>,
): Promise<void> {
  await store.set(agentCredentialKey(server, agentUser), JSON.stringify(credentials));
}
