import type { UserConfig } from "@commitlint/types";

// `pnpm commit` (commitizen with @commitlint/cz-commitlint) builds its prompts from this config.
export default {
  extends: ["@commitlint/config-conventional", "@commitlint/config-pnpm-scopes"],
} satisfies UserConfig;
