# The agent can read but not edit the Project Config

The agent may read the Project Config, so it knows which columns and Environments it can use before writing SQL. It must not edit it. In Claude Code, the plugin ships `PreToolUse` hooks that block `Edit` and `Write` on the config, and warns at session start if the user's settings don't block it with a `sandbox.filesystem.denyWrite` rule. A plugin can't ship that rule itself, and hooks can't reliably block Bash. The Widening Change approval (ADR 0002) is the second line of defence.

## Considered Options

- **Agent can read and edit it** (rejected): the human approval would be the only barrier, and approvals get rubber-stamped.
- **Agent can't see it, with Environment labels listed by the MCP** (rejected): hiding table and database names adds little security, since the Agent User's grants protect the data.
