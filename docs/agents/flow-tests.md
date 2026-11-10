# Flow tests

Flow tests in `tests/flow/src/` drive the built MCP bundle end to end: a real MCP client over stdio, against a real MySQL from Testcontainers. Run them with `pnpm test:flow`, which builds every bundle first.

## The harness

`tests/flow/src/harness.ts`:

- `startMcp(options)` spawns `tests/flow/dist/fake-mcp.mjs`, connects a client and returns a session with `query(environment, sql)` and the `elicitations` it received. The process stops when the test finishes.
  - `projectDir`: passed as `--project-dir` (omitted when `undefined`).
  - `credentials`: the fake keychain's starting entries, keyed as in ADR 0013 (`admin:<host>:<port>`, `agent:<host>:<port>:<agent user>`).
  - `gitEmail`: written to a temporary global git config (`GIT_CONFIG_GLOBAL`), or `null` for none.
  - `answer`: stands in for the human, answering every elicitation with `accept`, `decline` or `cancel`.
  - `protocol`: `2026-07-28` by default (Claude Code's), or `legacy` for the 2025 handshake.
- `makeTempDir()` makes a fresh project directory for the Project Config.

Use `useTestMysql()` from `@ai-database-safety-experiment/testing` for databases. Name them with its `prefix` so they are dropped after the test. Agent Users are named from the git email rather than the prefix, so drop them yourself with `onTestFinished`.

## The fake keychain

`tests/flow/src/fake-mcp.ts` is a test-only entry, built by `tests/flow/tsdown.config.ts`. It is the shipped MCP entry with the OS keychain swapped for a JSON file named by `FLOW_TEST_CREDENTIALS_FILE`. The shipped `dist/mcp.mjs` has no way to swap the store, so keep this switch out of `packages/`.
