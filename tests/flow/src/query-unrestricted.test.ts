import { agentUserName } from "@ai-database-safety-experiment/core";
import { describe, expect, it } from "vitest";
import { type ElicitationAnswer, makeTempDir, startMcp } from "#/harness";
import { mcpOptions, setUp, writeConfig } from "#/unrestricted-fixture";

const decline: ElicitationAnswer = { action: "decline" };

describe("query on an Unrestricted Environment", () => {
  it.each(["2026-07-28", "legacy"] as const)(
    "returns CSV rows after the human approves the widening (%s protocol)",
    async (protocol) => {
      const fixture = await setUp();
      const mcp = await startMcp(mcpOptions(fixture, { protocol }));

      const result = await mcp.query("dev", "SELECT id, note FROM items ORDER BY id");

      expect(result).toEqual({ isError: false, texts: ['id,note\n1,one\n2,\n3,""\n'] });
      expect(mcp.elicitations).toHaveLength(1);
      expect(mcp.elicitations[0]?.message).toContain(
        `every column of every table in the database "${fixture.database}" on ${fixture.test.server.host}:${fixture.test.server.port}`,
      );
    },
  );

  it("doesn't ask again once the widening is applied", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture));

    await mcp.query("dev", "SELECT 1 AS one");
    const second = await mcp.query("dev", "SELECT 2 AS two");

    expect(second).toEqual({ isError: false, texts: ["two\n2\n"] });
    expect(mcp.elicitations).toHaveLength(1);
  });
});

describe("query on an Unrestricted Environment without approval", () => {
  it.each([
    ["declines", decline],
    ["cancels", { action: "cancel" } as const],
    ["accepts without approving", { action: "accept", content: { approve: false } } as const],
  ])("applies nothing when the human %s", async (_case, answer) => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture, { answer: () => answer }));

    const result = await mcp.query("dev", "SELECT id FROM items");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toContain("[NO_AGENT_ACCESS]");
    expect(result.texts.join("\n")).toMatch(/widening .* was declined/u);
    const [users] = await fixture.test.admin.query("SELECT user FROM mysql.user WHERE user = ?", [
      agentUserName(fixture.gitEmail, "dev"),
    ]);
    expect(users).toEqual([]);
  });

  it("reports a failing query as a tool error", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT nope FROM items");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[QUERY_FAILED\]/u);
  });
});

describe("query refusals for the Project Config", () => {
  it("refuses without a Project Config", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture, { projectDir: await makeTempDir() }));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[CONFIG_MISSING\]/u);
  });

  it("refuses without --project-dir", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture, { projectDir: undefined }));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[CONFIG_MISSING\]/u);
  });

  it("refuses an invalid Project Config", async () => {
    const fixture = await setUp();
    await writeConfig(fixture.projectDir, { environments: {} });
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[CONFIG_INVALID\]/u);
  });
});

describe("query refusals for the Environment and developer", () => {
  it("refuses an unknown Environment", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("prod", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[UNKNOWN_ENVIRONMENT\]/u);
  });

  it("refuses without Admin Credentials for the server", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture, { credentials: {} }));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[ADMIN_CREDENTIALS_MISSING\]/u);
    expect(result.texts.join("\n")).toContain("Run `setup`");
  });

  it("refuses without a global git email", async () => {
    const fixture = await setUp();
    const mcp = await startMcp(mcpOptions(fixture, { gitEmail: null }));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[GIT_EMAIL_MISSING\]/u);
  });
});

describe("query when Sync fails", () => {
  it("refuses the query and keeps the Admin username out of the cause", async () => {
    const fixture = await setUp();
    const wrongPassword = JSON.stringify({ user: "root", password: "not-the-password" });
    const mcp = await startMcp(
      mcpOptions(fixture, { credentials: { [fixture.adminKey]: wrongPassword } }),
    );

    const result = await mcp.query("dev", "SELECT 1");
    const text = result.texts.join("\n");

    expect(result.isError).toBe(true);
    expect(text).toMatch(/^\[SYNC_FAILED\] Sync failed: Access denied for user '<redacted>'@/u);
    expect(text).not.toContain("'root'");
  });

  it("refuses an Environment whose tlsCaPath can't be read", async () => {
    const fixture = await setUp();
    const { test, projectDir, database } = fixture;
    await writeConfig(projectDir, {
      environments: {
        dev: { host: test.server.host, port: test.server.port, database, tlsCaPath: "./no.pem" },
      },
      unrestrictedEnvironments: ["dev"],
      columnAllowlist: {},
    });
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT 1");

    expect(result.isError).toBe(true);
    expect(result.texts.join("\n")).toMatch(/^\[CONFIG_INVALID\]/u);
  });
});

/** The database name as a grant needs it, with `_` escaped so it isn't a wildcard. */
function grantDatabase(database: string): string {
  return database.replaceAll("_", String.raw`\_`);
}

describe("query with an existing Agent User", () => {
  it("replaces a lost agent entry without asking when the grant is applied", async () => {
    const fixture = await setUp();
    const agentUser = agentUserName(fixture.gitEmail, "dev");
    await fixture.test.admin.query("CREATE USER ?@'%' IDENTIFIED BY 'lost-password'", [agentUser]);
    await fixture.test.admin.query(
      `GRANT SELECT ON \`${grantDatabase(fixture.database)}\`.* TO ?@'%'`,
      [agentUser],
    );
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT id FROM items ORDER BY id");

    expect(result).toEqual({ isError: false, texts: ["id\n1\n2\n3\n"] });
    expect(mcp.elicitations).toHaveLength(0);
  });

  it("grants an existing Agent User that has no access once approved", async () => {
    const fixture = await setUp();
    const agentUser = agentUserName(fixture.gitEmail, "dev");
    await fixture.test.admin.query("CREATE USER ?@'%' IDENTIFIED BY 'old-password'", [agentUser]);
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT id FROM items ORDER BY id");

    expect(result).toEqual({ isError: false, texts: ["id\n1\n2\n3\n"] });
    expect(mcp.elicitations).toHaveLength(1);
  });
});
