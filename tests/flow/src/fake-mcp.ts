// Test-only MCP entry: the shipped entry with the OS keychain swapped for a JSON file, so flow
// tests never touch a real keychain. Never shipped.
import { readFile, writeFile } from "node:fs/promises";
import type { CredentialStore } from "@ai-database-safety-experiment/core";
import { startMcpServer } from "@ai-database-safety-experiment/mcp";
import * as z from "zod";

const credentialsFile = process.env["FLOW_TEST_CREDENTIALS_FILE"];
if (credentialsFile === undefined) {
  throw new Error("FLOW_TEST_CREDENTIALS_FILE is not set");
}

const entriesSchema = z.record(z.string(), z.string());

async function readEntries(file: string): Promise<Record<string, string>> {
  return entriesSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

const fileCredentialStore: CredentialStore = {
  get: async (key) => (await readEntries(credentialsFile))[key] ?? null,
  set: async (key, value) => {
    const entries = await readEntries(credentialsFile);
    entries[key] = value;
    await writeFile(credentialsFile, JSON.stringify(entries));
  },
};

startMcpServer({ argv: process.argv.slice(2), credentialStore: fileCredentialStore });
