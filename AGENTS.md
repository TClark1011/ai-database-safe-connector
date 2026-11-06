# ai-database-safety-experiment

Lets an AI agent read from a developer's database without seeing credentials, writing data, or reading columns the developer hasn't approved. The agent sends SQL to an MCP server and gets CSV back; the database enforces access through a Safe Schema of views and a SELECT-only Agent User generated from the Project Config. Used by developers on their own projects, starting with MySQL and Claude Code. Early development: the monorepo foundation is in place, no features yet.

Run the `verify-code` skill before considering any code change complete.

Commit messages follow Conventional Commits, scoped to a workspace package name without its `@ai-database-safety-experiment/` prefix, or unscoped. When the `commit-msg` hook rejects a message, rewrite the message; never bypass the hook.

Domain terms are defined in `GLOSSARY.md`; design decisions are in `docs/adr/`. Security is the core requirement: read the ADRs before changing how access is enforced.

## Tech stack

- _Runtime:_ Node.js 26 for development, Node.js 24 or later for users
- _Language:_ TypeScript 7
- _Package manager:_ pnpm 12 workspaces
- _Monorepo tasks:_ Turborepo
- _Bundler:_ tsdown, bundling each runnable entry and its dependencies into one `.mjs` file
- _MCP:_ `@modelcontextprotocol/sdk`, stdio transport
- _Validation:_ zod 4, also generating the Project Config's JSON Schema (planned)
- _MySQL driver:_ `mysql2` (planned)
- _Keychain:_ `@napi-rs/keyring` (planned)
- _Setup CLI:_ `citty` and `@clack/prompts` (planned)
- _CSV:_ `csv-stringify` (planned)
- _Project Config format:_ JSON with a published `$schema` (planned)
- _Distribution:_ GitHub Releases, one zip per OS, extracted to `~/.claude/ai-database-safety-experiment/` (planned)
- _Claude Code plugin:_ marketplace in this repo, plugin config only, running the installed bundles (`userConfig.install_dir`)
- _Skill library:_ harness-agnostic package bundled into Harness Plugins (planned)
- _Other database engines:_ more Database Adapters, e.g. PostgreSQL (planned)
- _Other harnesses:_ more Harness Plugins under `plugins/` (planned)
- _Testing:_ Vitest, with Testcontainers running a real MySQL in Docker
- _CI:_ GitHub Actions
- _Commit messages:_ commitlint (Lefthook `commit-msg` hook), commitizen as `pnpm commit`
- _Releases:_ semantic-release on every push to `main` that touches shipped code, versioned from Conventional Commits; the Claude Code plugin has no `version`, so it tracks commits

When you add, remove or replace a technology, or build a planned one, update this list in the same change.

## Layout

- `packages/core/`: harness-agnostic shared logic: Project Config, Widening Change diff, Database Adapter interface, keychain store, CSV
- `packages/adapter-mysql/`: MySQL Database Adapter: Sync (Safe Schema, Agent User, grants) and read-only query execution
- `packages/mcp/`: the MCP server, bundled to `dist/mcp.mjs`
- `packages/setup/`: interactive credential setup and the Widening Change approval fallback, bundled to `dist/setup.mjs`
- `plugins/claude-code/`: the Claude Code plugin (`.claude-plugin/plugin.json`, `.mcp.json`) and its hooks, bundled to `dist/hooks.mjs`
- `.claude-plugin/marketplace.json`: the Claude Code plugin marketplace
- `docs/adr/`: architecture decision records

Workspace packages are private and consumed as TypeScript source. Import other packages only through `@ai-database-safety-experiment/<package>`, never through paths inside them. Inside a package, import from its own `src/` with the `#/*` alias (Node subpath imports, e.g. `#/product`).
