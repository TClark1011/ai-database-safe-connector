import { writeFile } from "node:fs/promises";
import { projectConfigJsonSchema } from "#/project-config-json-schema";

const outputUrl = new URL("../project-config.schema.json", import.meta.url);

await writeFile(outputUrl, `${JSON.stringify(projectConfigJsonSchema)}\n`);
