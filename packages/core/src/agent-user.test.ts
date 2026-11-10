import { describe, expect, it } from "vitest";
import { agentUserName } from "#/agent-user";

describe("agentUserName", () => {
  it("names the Agent User from the email hash and the Environment", () => {
    expect(agentUserName("dev@example.com", "staging")).toBe("eb2b6c0d_agent_staging");
  });

  it("lowercases and trims the email before hashing", () => {
    expect(agentUserName("  Dev@Example.COM\n", "dev")).toBe("eb2b6c0d_agent_dev");
  });
});
