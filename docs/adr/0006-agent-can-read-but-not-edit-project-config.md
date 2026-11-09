# The agent can read but not edit the Project Config

The agent may read the Project Config, so it knows which columns and Environments it can use before writing SQL. It must not edit it. The Widening Change approval (ADR 0002) is the second line of defence.

In Claude Code, the file tools and Bash need different controls. `sandbox.filesystem.denyWrite` only constrains sandboxed shell commands; the `Edit`, `Write` and `NotebookEdit` tools follow permission rules and hooks instead. A plugin can ship hooks but not settings, and no API exposes the effective settings.

- **File tools:** the plugin ships a `PreToolUse` hook on `Edit|Write|NotebookEdit` (and `MultiEdit` if that tool exists) that blocks when the target is the Project Config. It compares device and inode with the config, so symlinks, hard links and case-insensitive paths can't get round it. When the target doesn't exist yet, it compares the resolved parent directory plus file name, case-insensitively on case-insensitive volumes, so the agent can't create the config either. When it can't decide, it blocks. A hook that crashes or exits with any code other than 2 lets the tool run, so the setup docs also recommend a `permissions.deny` `Edit(/<config file>)` rule in the project's committed settings. Deny rules hold whatever the hook outputs, but they match by path and don't cover hard links.
- **Bash:** hooks can't reliably block it, so protection relies on `sandbox.enabled` plus a `sandbox.filesystem.denyWrite` entry for the config.

The plugin parses the user, project and local settings files at session start, and again from a `ConfigChange` hook, and gives one non-blocking warning listing whichever of these is missing: the sandbox, the `denyWrite` entry, the `Edit` deny rule. It can't read managed policy or `--settings`, so the warning may fire when protection is in place; it says so and shows the settings to add. The setup CLI's `status` reports the same checks, and `setup` offers to merge the recommended settings into `.claude/settings.json`, showing the change first and printing it instead if the file isn't plain JSON. The agent never writes settings (ADR 0007).

The Widening Change approval is only human if no hook answers it for them. Claude Code `Elicitation` hooks can answer an elicitation with no dialog, and `ElicitationResult` hooks can change the human's answer. The plugin warns, without blocking, when the user's settings files hold either kind of hook with a matcher that could match our MCP server. The check runs at session start and again from a `ConfigChange` hook when a settings file changes. It is best effort: hooks can also come from managed policy, `--settings`, other plugins and frontmatter, which the plugin can't read.

## Consequences

- A hard link to the config, created from Bash, may let Bash write the config through the sandbox, since both the Linux and macOS sandboxes match denied paths rather than files. This is unverified and accepted for now: the Widening Change approval still catches any widening.

## Considered Options

- **Agent can read and edit it** (rejected): the human approval would be the only barrier, and approvals get rubber-stamped.
- **Agent can't see it, with Environment labels listed by the MCP** (rejected): hiding table and database names adds little security, since the Agent User's grants protect the data.
- **Hook only, no recommended deny rule** (rejected): a missing or broken bundle makes the hook fail open.
- **Refuse queries until the settings are in place** (rejected): detection only covers settings files, and the plugin warns rather than blocks elsewhere (ADR 0007).
- **Sync refuses a config with more than one hard link** (rejected): the agent can remove the link after writing through it, and the approval covers widening anyway.
