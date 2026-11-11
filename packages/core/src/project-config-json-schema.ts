import * as z from "zod";
import { projectConfigSchema } from "#/project-config";

const projectConfigJsonSchemaUrl =
  "https://github.com/TClark1011/ai-database-safe-connector/releases/latest/download/project-config.schema.json";

const { $schema, ...generated } = z.toJSONSchema(projectConfigSchema, { io: "input" });

/** The JSON Schema that a Project Config's `$schema` points to, generated from the zod schema. */
export const projectConfigJsonSchema: Record<string, unknown> = {
  $schema,
  $id: projectConfigJsonSchemaUrl,
  title: "Project Config",
  ...generated,
};
