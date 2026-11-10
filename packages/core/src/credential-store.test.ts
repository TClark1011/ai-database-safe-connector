import { describe, expect, it } from "vitest";
import {
  type CredentialStore,
  adminCredentialKey,
  agentCredentialKey,
  readAdminCredentials,
  readAgentCredentials,
} from "#/credential-store";

function storeWith(entries: Readonly<Record<string, string>>): CredentialStore {
  return {
    get: (key) => Promise.resolve(entries[key] ?? null),
    set: () => Promise.reject(new Error("read-only test store")),
  };
}

const server = { host: "DB.Example.com", port: 3306 };

describe("keychain keys", () => {
  it("keys Admin Credentials by lowercased host and explicit port", () => {
    expect(adminCredentialKey(server)).toBe("admin:db.example.com:3306");
  });

  it("keys agent entries by lowercased host, port and Agent User", () => {
    expect(agentCredentialKey(server, "eb2b6c0d_agent_dev")).toBe(
      "agent:db.example.com:3306:eb2b6c0d_agent_dev",
    );
  });
});

describe("reading keychain entries", () => {
  it("reads stored Admin Credentials", async () => {
    const store = storeWith({
      "admin:db.example.com:3306": JSON.stringify({ user: "admin", password: "secret" }),
    });

    await expect(readAdminCredentials(store, server)).resolves.toEqual({
      user: "admin",
      password: "secret",
    });
  });

  it("refuses missing Admin Credentials with ADMIN_CREDENTIALS_MISSING", async () => {
    await expect(readAdminCredentials(storeWith({}), server)).rejects.toMatchObject({
      code: "ADMIN_CREDENTIALS_MISSING",
    });
  });

  it("reads a missing agent entry as null", async () => {
    await expect(readAgentCredentials(storeWith({}), server, "u")).resolves.toBeNull();
  });

  it.each([
    ["malformed JSON", "{"],
    ["a missing field", JSON.stringify({ password: "p", database: "d" })],
    ["an unknown tls mode", JSON.stringify({ password: "p", database: "d", tls: "maybe" })],
  ])("refuses an agent entry with %s", async (_case, value) => {
    const store = storeWith({ "agent:db.example.com:3306:u": value });

    await expect(readAgentCredentials(store, server, "u")).rejects.toMatchObject({
      code: "SYNC_FAILED",
    });
  });
});
