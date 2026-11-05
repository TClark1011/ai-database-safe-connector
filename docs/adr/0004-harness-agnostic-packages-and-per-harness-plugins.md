# Harness-agnostic packages, plus one plugin package per Harness

The monorepo splits into harness-agnostic packages under `packages/` (core, Database Adapters, MCP server, setup) and one Harness Plugin package per Harness under `plugins/`, starting with Claude Code. Supporting a new Harness means adding a plugin package, without changing the harness-agnostic ones. Anything that relies on a Harness feature, such as Claude Code hooks, lives only in that Harness's plugin.
