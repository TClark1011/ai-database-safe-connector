# Threat model: the agent's shell is sandboxed

Security assumes the Harness sandboxes the agent's shell, so it can't write outside the project, read the OS keychain or tamper with the installed bundles. An agent with unrestricted shell access, running as the user's OS account, could read keychain entries or fake a terminal session to answer the approval fallback. This project doesn't try to defend against that. It documents the requirement and, where the Harness allows, warns when the sandbox is missing.

Writing the Harness's settings or hook configuration counts as escaping the sandbox. Claude Code hooks run unsandboxed as the user, so an agent that can add one can do anything above, including adding an `Elicitation` hook that approves Widening Changes. We don't defend the approval against that separately. In Claude Code, `bypassPermissions` mode, or the human accepting an agent's edit to settings files, voids these guarantees. A plugin `PreToolUse` hook on the query tool warns once per session, without blocking, when the permission mode is `bypassPermissions`.

## Considered Options

- **Challenge a hook can't answer** (rejected), such as a one-time code the human types: a hook sees the elicitation message too, and an agent that can write hooks has other ways out.
- **Refuse Sync when an Elicitation hook is detected** (rejected): detection only covers settings files, so refusal gives a false sense of enforcement, and it blocks a user who set the hook up on purpose.
