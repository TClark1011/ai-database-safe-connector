# The agent can read but not edit the Project Config

The agent may read the Project Config, so it knows which columns and Environments it can use before writing SQL. It must not edit it. In Claude Code, the plugin ships `PreToolUse` hooks that block `Edit` and `Write` on the config, and warns at session start if the user's settings don't block it with a `sandbox.filesystem.denyWrite` rule. A plugin can't ship that rule itself, and hooks can't reliably block Bash. The Widening Change approval (ADR 0002) is the second line of defence.

That approval is only human if no hook answers it for them. Claude Code `Elicitation` hooks can answer an elicitation with no dialog, and `ElicitationResult` hooks can change the human's answer. The plugin warns, without blocking, when the user's settings files hold either kind of hook with a matcher that could match our MCP server. The check runs at session start and again from a `ConfigChange` hook when a settings file changes. It is best effort: hooks can also come from managed policy, `--settings`, other plugins and frontmatter, which the plugin can't read.

## Considered Options

- **Agent can read and edit it** (rejected): the human approval would be the only barrier, and approvals get rubber-stamped.
- **Agent can't see it, with Environment labels listed by the MCP** (rejected): hiding table and database names adds little security, since the Agent User's grants protect the data.
