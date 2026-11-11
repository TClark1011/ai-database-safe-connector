# ai-database-safety-experiment

Lets an AI agent working in a project's codebase read from that project's database without seeing credentials, writing data, or reading columns the developer hasn't approved; it learns the schema from the code, not the tool. The agent sends SQL to an MCP server and gets CSV back; the database enforces access through a Safe Schema of views and a SELECT-only Agent User generated from the Project Config. Used by developers on their own projects, starting with MySQL and Claude Code. Early development: the `query` tool works for Unrestricted Environments; restricted Environments, setup and the release zips are still to come.

## Tech stack

- _Runtime:_ Node.js 26 for development, Node.js 24 or later for users
- _Language:_ TypeScript 7
- _Package manager:_ pnpm 12 workspaces
- _Monorepo tasks:_ Turborepo
- _Bundler:_ tsdown, bundling each runnable entry and its dependencies into one `.mjs` file
- _MCP:_ MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/client` in tests), stdio via `serveStdio`
- _Validation:_ zod 4, validating the Project Config, and generating its JSON Schema (`pnpm generate:schema`, committed by CI on pull requests)
- _MySQL driver:_ `mysql2`
- _Keychain:_ `@napi-rs/keyring`, kept outside the bundles since it is a native module
- _Setup CLI:_ `citty` and `@clack/prompts` (planned)
- _CSV:_ `csv-stringify`
- _Project Config format:_ JSON with a `$schema` published as a GitHub Release asset
- _Distribution:_ GitHub Releases, one zip per OS, extracted to `~/.claude/ai-database-safety-experiment/`, with the `@napi-rs/keyring` native module shipped beside the bundles (planned)
- _Claude Code plugin:_ marketplace in this repo, plugin config only, running the installed bundles (`userConfig.install_dir`)
- _Skill library:_ harness-agnostic package bundled into Harness Plugins (planned)
- _Other database engines:_ more Database Adapters, e.g. PostgreSQL (planned)
- _Other harnesses:_ more Harness Plugins under `plugins/` (planned)
- _Testing:_ Vitest, with Testcontainers running a real MySQL in Docker; ajv checks the generated JSON Schema
- _CI:_ GitHub Actions
- _Commit messages:_ commitlint (Lefthook `commit-msg` hook), commitizen as `pnpm commit`
- _Releases:_ semantic-release on every push to `main` that touches shipped code, versioned from Conventional Commits; the Claude Code plugin has no `version`, so it tracks commits

When you add, remove or replace a technology, or build a planned one, update this list in the same change.

## Layout

- `packages/core/`: harness-agnostic shared logic: Project Config, Widening Change diff, Database Adapter interface, keychain store, CSV
- `packages/adapter-mysql/`: MySQL Database Adapter: Sync (Safe Schema, Agent User, grants) and read-only query execution
- `packages/mcp/`: the MCP server, bundled to `dist/mcp.mjs`; exports `startMcpServer` so the flow tests' entry can swap the keychain store
- `packages/setup/`: interactive credential setup and the Widening Change approval fallback, bundled to `dist/setup.mjs`
- `packages/testing/`: shared test setup: the MySQL container and per-test databases and users
- `plugins/claude-code/`: the Claude Code plugin (`.claude-plugin/plugin.json`, `.mcp.json`) and its hooks, bundled to `dist/hooks.mjs`
- `tests/flow/`: flow tests that drive the built bundles end to end; see `docs/agents/flow-tests.md`
- `.claude-plugin/marketplace.json`: the Claude Code plugin marketplace
- `docs/adr/`: architecture decision records

## Working on this project

Security is the core requirement. Domain terms are defined in `GLOSSARY.md` and design decisions are in `docs/adr/`; read the ADRs before changing how access is enforced.

Every failure a human or the agent sees is an `AppError` with a stable code and a next step; follow `docs/agents/errors.md`.

Run `pnpm install`, `add`, `remove` and `update` from the repository root, as the whole command with no pipe or chaining, and with the subcommand first (e.g. `pnpm add zod --filter @ai-database-safety-experiment/core`): only that form runs outside the sandbox, which they need.

Workspace packages are private and consumed as TypeScript source. Import other packages only through `@ai-database-safety-experiment/<package>`, never through paths inside them. Inside a package, import from its own `src/` through the `#/*` alias, which points at that package's `src/` (e.g. `#/product`).

Branch from `main` as `<type>/<short-name>`, using a Conventional Commits type (e.g. `feat/query-tool`); `main` is the Dev Branch. Commit messages follow Conventional Commits, scoped to a workspace package name without its `@ai-database-safety-experiment/` prefix, or unscoped. When the `commit-msg` hook rejects a message, rewrite the message; never bypass the hook.

## Skill router

| When                                                     | Skills                              |
| -------------------------------------------------------- | ----------------------------------- |
| Writing or changing code                                 | `verify-code`                       |
| Building a feature or fixing a bug                       | `test-driven-development`           |
| Writing or changing tests                                | `vitest`, `test-driven-development` |
| Working in `plugins/claude-code/` or `.claude-plugin/`   | `plugin-structure`                  |
| Reviewing a branch, PR or work-in-progress changes       | `code-review`                       |
| Discussing domain terms, editing `GLOSSARY.md` or an ADR | `domain-modeling`                   |
| Stress-testing a plan or design                          | `grilling`                          |

When you add, remove or rename a skill, update this router in the same change.

## Issue tracker

Issues live in GitHub Issues on `TClark1011/ai-database-safe-connector`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
