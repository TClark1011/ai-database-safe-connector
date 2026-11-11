import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import { AppError, errorMessage } from "#/errors";

export const projectConfigFileName = "ai-db-safety.json";

const environmentName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,16}$/u);

export const tlsModeSchema = z.enum(["off", "required", "verify"]);
export type TlsMode = z.output<typeof tlsModeSchema>;

const environmentSchema = z.strictObject({
  host: z.string().min(1),
  database: z.string().min(1),
  port: z.int().min(1).max(65_535).default(3306),
  tls: tlsModeSchema.default("verify"),
  tlsCaPath: z.string().min(1).optional(),
});

interface UnrestrictedEnvironmentsInput {
  readonly environments: Readonly<Record<string, unknown>>;
  readonly unrestrictedEnvironments: readonly string[];
}

function checkUnrestrictedEnvironments(
  config: UnrestrictedEnvironmentsInput,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, name] of config.unrestrictedEnvironments.entries()) {
    if (!Object.hasOwn(config.environments, name)) {
      ctx.addIssue({
        code: "custom",
        path: ["unrestrictedEnvironments", index],
        message: `"${name}" is not an Environment`,
      });
    }
    if (seen.has(name)) {
      ctx.addIssue({
        code: "custom",
        path: ["unrestrictedEnvironments", index],
        message: `"${name}" is listed twice`,
      });
    }
    seen.add(name);
  }
}

// JSON Schema drops refinements, so `.meta()` mirrors each one that JSON Schema can express.
export const projectConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    environments: z
      .record(environmentName, environmentSchema)
      .refine(
        (environments: Readonly<Record<string, unknown>>) => Object.keys(environments).length > 0,
        { message: "Define at least one Environment" },
      )
      .meta({ minProperties: 1 }),
    unrestrictedEnvironments: z.array(z.string()).meta({ uniqueItems: true }).default([]),
    columnAllowlist: z.record(
      z.string(),
      z.record(z.string(), z.enum(["full", "obfuscated", "hidden"])),
    ),
    globalColumnAllowlist: z.record(z.string(), z.enum(["full", "obfuscated"])).default({}),
  })
  .superRefine(checkUnrestrictedEnvironments);

export type ProjectConfig = Omit<z.output<typeof projectConfigSchema>, "$schema">;
export type EnvironmentConfig = z.output<typeof environmentSchema>;

/** Reads and validates the Project Config at the root of `projectDir`. */
export async function loadProjectConfig(projectDir: string): Promise<ProjectConfig> {
  const filePath = path.join(projectDir, projectConfigFileName);

  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    throw new AppError(
      "CONFIG_MISSING",
      `No Project Config at ${filePath}.`,
      `Create ${projectConfigFileName} at the project root.`,
      { cause: error },
    );
  }

  const invalid = (detail: string, cause?: unknown): AppError =>
    new AppError(
      "CONFIG_INVALID",
      `The Project Config at ${filePath} is invalid: ${detail}`,
      `Fix ${projectConfigFileName}.`,
      { cause },
    );

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw invalid(errorMessage(error), error);
  }

  const result = projectConfigSchema.safeParse(json);
  if (!result.success) {
    throw invalid(z.prettifyError(result.error));
  }
  const { $schema: _schema, ...config } = result.data;
  return config;
}
