# ai-database-safety-experiment

Lets an AI agent read from your database without seeing your credentials, writing anything, or reading columns you haven't approved. The agent sends SQL to an MCP server and gets CSV back. The database itself enforces what the agent can see, through a schema of views and a SELECT-only user generated from a per-project config.

Status: early development. V1 targets MySQL and Claude Code.

## Requirements

- [Node.js](https://nodejs.org) 24 or later (26 for development, see `.nvmrc`)
- [pnpm](https://pnpm.io/installation) 12

## Develop

```sh
pnpm install
pnpm build       # build every package
pnpm dev         # run every package in watch mode
pnpm typecheck   # type-check every package
```

Run a single package with a filter, e.g. `pnpm --filter @ai-database-safety-experiment/mcp dev`.

`pnpm generate:schema` regenerates `packages/core/project-config.schema.json` from the Project Config's zod schema. CI regenerates and commits it on pull requests.

## Project Config

Each project has an `ai-db-safety.json` at its root. Point its `$schema` at the published JSON Schema for editor validation and completion:

```json
{
  "$schema": "https://github.com/TClark1011/ai-database-safe-connector/releases/latest/download/project-config.schema.json"
}
```

The JSON Schema can't check that each `unrestrictedEnvironments` entry names a defined Environment; the MCP server still refuses a config that breaks that rule.

## Packages

| Path                     | What it is                                              |
| ------------------------ | ------------------------------------------------------- |
| `packages/core`          | Harness-agnostic shared logic                           |
| `packages/adapter-mysql` | MySQL Database Adapter                                  |
| `packages/mcp`           | The MCP server, built to `dist/mcp.mjs`                 |
| `packages/setup`         | Interactive credential setup, built to `dist/setup.mjs` |
| `plugins/claude-code`    | The Claude Code plugin and its hooks                    |

## Install (Claude Code)

Not usable yet. The planned flow:

1. Download the GitHub Release zip for your OS and extract it to `~/.claude/ai-database-safety-experiment/`.
2. From your project's directory, run `node ~/.claude/ai-database-safety-experiment/setup.mjs` to store credentials in your OS keychain.
3. In Claude Code, run `/plugin marketplace add <owner>/<repo>`, then install `ai-database-safety-experiment` and point it at the install directory.

## License

MIT
