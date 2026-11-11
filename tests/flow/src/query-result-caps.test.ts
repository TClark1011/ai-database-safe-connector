import type { TestMysql } from "@ai-database-safety-experiment/testing";
import { describe, expect, it } from "vitest";
import { startMcp } from "#/harness";
import { mcpOptions, setUp } from "#/unrestricted-fixture";

/** Seeds `counted` with the numbers 0 to `count` - 1, zero-padded to four digits. */
async function seedCounted(
  admin: TestMysql["admin"],
  database: string,
  count: number,
): Promise<void> {
  await admin.query(`CREATE TABLE \`${database}\`.counted (n CHAR(4))`);
  await admin.query(`INSERT INTO \`${database}\`.counted VALUES ?`, [
    Array.from({ length: count }, (_, n) => [String(n).padStart(4, "0")]),
  ]);
}

describe("query result caps", () => {
  it("stops at 1000 rows and notes the truncation", async () => {
    const fixture = await setUp();
    await seedCounted(fixture.test.admin, fixture.database, 1001);
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT n FROM counted ORDER BY n");

    expect(result.isError).toBe(false);
    const [csv, notes] = result.texts;
    expect(csv?.split("\n").slice(-3)).toEqual(["0998", "0999", ""]);
    expect(csv?.split("\n")).toHaveLength(1002);
    expect(notes).toMatch(/first 1,000 rows/u);
  });

  it("stops at 40,000 characters, at a row boundary, and notes the truncation", async () => {
    const fixture = await setUp();
    await seedCounted(fixture.test.admin, fixture.database, 1000);
    const mcp = await startMcp(mcpOptions(fixture));

    // Every row has the same length, so the character cap falls after a known row.
    const result = await mcp.query(
      "dev",
      "SELECT n, REPEAT('x', 100) AS pad FROM counted ORDER BY n",
    );

    expect(result.isError).toBe(false);
    const [csv, notes] = result.texts;
    expect(csv).toHaveLength(6 + 377 * 106);
    expect(csv?.endsWith(`0376,${"x".repeat(100)}\n`)).toBe(true);
    expect(notes).toMatch(/first 377 rows, cut at 40,000 characters/u);
  });

  it("adds no notes block when nothing was cut", async () => {
    const fixture = await setUp();
    await seedCounted(fixture.test.admin, fixture.database, 1000);
    const mcp = await startMcp(mcpOptions(fixture));

    const result = await mcp.query("dev", "SELECT n FROM counted");

    expect(result.texts).toHaveLength(1);
  });
});
