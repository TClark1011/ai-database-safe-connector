import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { projectConfigJsonSchema } from "#/project-config-json-schema";
import {
  invalidProjectConfigs,
  validProjectConfigs,
  zodOnlyInvalidProjectConfigs,
} from "#/project-config.fixtures";

const validate = new Ajv2020({ strict: true }).compile(projectConfigJsonSchema);

describe("projectConfigJsonSchema", () => {
  it.each(validProjectConfigs)("accepts a config with $name", ({ config }) => {
    validate(config);

    expect(validate.errors).toBeNull();
  });

  it.each(invalidProjectConfigs)("refuses $name", ({ config }) => {
    expect(validate(config)).toBe(false);
  });

  // Known gaps: if one of these starts failing, move it to invalidProjectConfigs.
  it.each(zodOnlyInvalidProjectConfigs)("can't express the rule refusing $name", ({ config }) => {
    expect(validate(config)).toBe(true);
  });

  it("matches the committed project-config.schema.json (`pnpm generate:schema` updates it)", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../project-config.schema.json", import.meta.url), "utf8"),
    );

    expect(committed).toEqual(projectConfigJsonSchema);
  });
});
