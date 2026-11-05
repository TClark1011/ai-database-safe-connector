# Distribute through GitHub Releases, without npm publishing

For now, nothing is published to npm. Each GitHub Release has one zip per OS containing the bundled `mcp.mjs`, `setup.mjs` and `hooks.mjs`, plus that OS's keychain native module. Users extract it to `~/.claude/ai-database-safety-experiment/`. The Claude Code plugin, installed from this repo's marketplace, contains only config and runs the bundles from the folder chosen in its `install_dir` option. All workspace packages are private.

The install folder must be outside any project, because the agent can write inside the project and could otherwise change the MCP's code. For the same reason, the setup script runs from the install folder rather than being copied into the project.

## Considered Options

- **`npx` from public npm** (rejected for now): needs npm publishing set up. Worth revisiting if the project is published properly.
- **Install folder in the project's `.claude/`** (rejected): writable by the agent.
