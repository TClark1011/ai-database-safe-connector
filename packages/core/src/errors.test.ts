import { describe, expect, it } from "vitest";
import { AppError, formatError } from "#/errors";

describe("formatError", () => {
  it("renders an AppError as its code, cause and next step", () => {
    const error = new AppError("CONFIG_MISSING", "No Project Config.", "Create one.");

    expect(formatError(error)).toBe("[CONFIG_MISSING] No Project Config.\nNext step: Create one.");
  });

  it("renders anything else as UNEXPECTED", () => {
    expect(formatError(new Error("boom"))).toBe(
      "[UNEXPECTED] boom\nNext step: Report this as a bug.",
    );
  });
});
