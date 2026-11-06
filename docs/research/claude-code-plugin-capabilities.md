# Claude Code plugin capabilities for hooks and config

Research for issue #16 (child of map #4). Checked against the Claude Code docs on 2026-11-06. Docs were fetched through WebFetch, which summarises pages with a small model; quotes below come from those excerpts and were not re-read on the live site. Pages over 100k characters were read only in part (see Not verified).

## Answers

1. **`userConfig` to `.mcp.json`: yes.** `${user_config.install_dir}` is substituted in MCP server `command`, `args` and `env`. Declare the option with `"type": "directory"`.
2. **`userConfig` to hooks: yes, two ways.**
   - Exec-form hooks (`command` plus `args`) accept `${user_config.install_dir}`.
   - The `CLAUDE_PLUGIN_OPTION_INSTALL_DIR` env var is exported to every hook process.
   - Shell-form hook `command` strings reject `${user_config.*}` and fail with an error.
   - MCP stdio servers do not get `CLAUDE_PLUGIN_OPTION_*` in their environment; they get only `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`. Pass the value through `args` or `env` substitution.
3. **PreToolUse on Edit/Write for the Project Config path: yes, reliable for the file tools.**
   - `tool_input.file_path` is always absolute for `Write`, `Edit` and `Read`. Claude Code expands `~` and relative paths before hooks run, so those spellings cannot bypass a path match.
   - Plugin hooks also run inside subagents (input carries `agent_id` and `agent_type`).
   - A hook that exits 2 blocks the call before permission rules are evaluated, even if an allow rule matches.
   - Caveats:
     - Bash writes are not covered (ADR 0006 already assumes this).
     - `MultiEdit` is not mentioned in the docs read, and `NotebookEdit` has no documented input schema. Match `Edit|Write|NotebookEdit` and confirm field names against a real payload.
     - Symlink handling in hook path matching is not described. The hook should `realpath` the target itself.
     - Matchers are exact tool names unless they contain characters outside letters, digits, `_`, `-`, space, `,`, `|`. `Edit|Write` is exact; `Edit.*` is an unanchored regex.
4. **SessionStart detecting a `sandbox.filesystem.denyWrite` rule: not through Claude Code. Only by the hook reading the settings files itself.**
   - SessionStart input has no settings content (common fields plus `source`, sometimes `model`). No doc read says any hook input exposes effective or merged settings.
   - Docs: "The sandbox covers shell commands only. Claude's file tools, MCP servers, and hooks run outside it." So a hook can read `~/.claude/settings.json`, `.claude/settings.json` and `.claude/settings.local.json` from disk.
   - That check is best-effort, not authoritative:
     - It must reimplement the scope merge. Filesystem arrays such as `denyWrite` are merged across scopes.
     - Managed settings can arrive through server-managed settings or MDM, which a hook cannot read as files. A `--settings` file is not discoverable from hook input.
     - Settings reload mid-session, so a SessionStart result goes stale. A `ConfigChange` hook (matchers `user_settings`, `project_settings`, `local_settings`) can re-run the check; it receives `source` and `file_path`.
     - Relative `denyWrite` paths resolve against the project root in project settings but against `~/.claude` in user settings.
   - See "Finding that affects ADR 0006" below: `denyWrite` is not the right control for the file tools anyway.

## Related question: Elicitation hooks and settings-file protection

**Can a plugin hook or MCP server detect an `Elicitation` hook in the user's settings?**

- Not through any documented Claude Code API. The only route is reading and parsing settings files from disk (same limits as above).
- An Elicitation hook can come from user, project and local settings, managed policy, `--settings`, another plugin's `hooks/hooks.json`, or skill and subagent frontmatter. Only the settings files are readable. Docs say hook entries merge across levels and matching hooks run in parallel, so absence in the three files does not prove absence.
- An MCP server cannot see which hooks exist. It can only observe that its elicitation request was answered with no dialog (the hook returns `accept`/`decline`/`cancel`). This is an inference, not a documented detection mechanism.

**Does the sandbox or permission system stop the agent writing settings files that could add hooks?**

- **Sandbox (Bash only): partly yes.**
  - Docs: "Inside the directories that sandboxed commands can write to, the sandbox still denies writes to the files Claude Code loads configuration and code from."
  - Covered: the `.claude` settings files and `.claude/skills`, `agents`, `commands`, `hooks` in the working directory and directories above it, plus `.mcp.json`. In `~/.claude`: "most of its contents", plus `~/.claude.json`.
  - An `allowWrite` entry or `Edit` allow rule does not lift this. Only `sandbox.filesystem.disabled` does, and that turns off all filesystem isolation.
  - `~/.claude/settings.json` is not named individually; it falls under "most of its contents" (inference).
- **Edit/Write/NotebookEdit tools: not sandboxed; they follow permission rules.**
  - `.claude` is a protected directory. Writes are never auto-approved except in `bypassPermissions`.
  - By mode: `default` and `acceptEdits` prompt; `auto` routes to the classifier; `dontAsk` denies; `bypassPermissions` allows; `plan` allows in interactive sessions with bypass permissions available, otherwise classifier or prompt.
  - `permissions.allow` rules cannot pre-approve protected-path writes.
  - Protected files also include `.mcp.json`, `.claude.json` and any file passed to `--settings`.
  - The prompt can offer a session-scoped "allow edits in this project's .claude folder" (and `~/.claude`) option. A user who accepts that, or who runs `bypassPermissions`, lets the agent edit settings files.
- **Other blocks available:**
  - A PreToolUse hook on `Edit|Write|NotebookEdit` for the settings paths.
  - A `permissions.deny` `Edit(...)` rule (deny rules hold regardless of hook output).
  - A `ConfigChange` hook exiting 2 stops a changed settings file from being applied to the running session. Non-managed sources only; the block is silent (debug log only) and the file on disk still changes. Plugin-shipped `ConfigChange` hooks are not explicitly confirmed to behave the same as settings-file ones.
  - `permissions.blockWritesOutsideWorkingDirectories` refuses `Write`/`Edit`/`NotebookEdit` to "settings files in every permission mode". The excerpt is ambiguous about whether this includes the project's own `.claude/settings*.json`; treat as unverified.
- **Bash is the remaining gap** if the sandbox is off, if a command is retried unsandboxed (`allowUnsandboxedCommands`), or in `bypassPermissions` without a sandbox. This matches ADR 0007.

## Finding that affects ADR 0006

- `sandbox.filesystem.denyWrite` constrains sandboxed shell commands only. The sandboxing docs say the Edit and Write tools "follow permission rules instead" of the sandbox (the docs' worked example is `denyRead` not stopping the Read tool; the write-side conclusion is an inference from the same statement).
- The Project Config therefore needs a `permissions.deny` `Edit(path)` rule or the plugin's PreToolUse hook for the file tools, and `denyWrite` for Bash. ADR 0006's session-start warning checks only the `denyWrite` half. Consider also checking for an `Edit` deny rule, or relying on the hook for file tools and warning only about Bash.

## Plugin config notes

- `userConfig` option fields: `type` (`string`, `number`, `boolean`, `directory`, `file`), `title`, `description`, optional `required`, `default`, `sensitive`, `options`, `multiple`, `min`/`max`. Unknown keys fail plugin load.
- Non-sensitive values are stored under `pluginConfigs` in user `settings.json` (scope listed as User or managed). Sensitive values go to the OS credential store.
- `claude plugin validate` errors on a `${user_config.KEY}` reference to an undeclared option (v2.1.281 or later).
- Plugin hooks live in `hooks/hooks.json` (or inline in `plugin.json`) and MCP servers in `.mcp.json`; both are merged with any manifest-declared entries.

## Not verified

- Whether any hook input or API exposes effective settings (docs read do not say; absence of evidence only).
- `MultiEdit` as a tool name; `NotebookEdit` input schema.
- Fail-open vs fail-closed for a crashing PreToolUse hook. The excerpt confirms "an exit code other than 0 or 2 without valid JSON output is a non-blocking error" for one event; the "block the action when a hook fails" section was not read.
- Symlink handling in hook path matching.
- Which decision wins when a plugin hook and a settings hook disagree. Docs say matching hooks run in parallel and that deny rules always hold.
- The settings reference (about 449k characters), hooks (about 289k) and permissions pages were read in part. `allowManagedHooksOnly` (managed only) and `disableAllHooks` (any file) are known only from the settings index. A repo's `.claude/settings.json` can set `disableAllHooks`; the hooks docs warn project settings take precedence over user settings for it. Whether this disables plugin hooks, and whether a plugin can detect it, is untested.
- Windows and Linux behaviour; macOS assumed.

## Sources

- Plugin manifest reference (userConfig, env vars, where `${...}` resolves): https://code.claude.com/docs/en/plugins-reference
- Hooks reference (PreToolUse input, file_path normalisation, subagents, SessionStart, ConfigChange, Elicitation): https://code.claude.com/docs/en/hooks
- Sandboxing (scope, built-in write protections, denyWrite): https://code.claude.com/docs/en/sandboxing
- Settings files and precedence (scopes, merge, reload): https://code.claude.com/docs/en/settings
- Settings reference index (`pluginConfigs`, `disableAllHooks`, `allowManagedHooksOnly`, sandbox keys): https://code.claude.com/docs/en/settings-reference
- Permissions (hooks vs rules precedence): https://code.claude.com/docs/en/permissions
- Permission modes (protected paths): https://code.claude.com/docs/en/permission-modes
- Repo context: `docs/adr/0006-agent-can-read-but-not-edit-project-config.md`, `docs/adr/0007-threat-model-assumes-sandboxed-agent-shell.md`, `docs/adr/0008-distribute-through-github-releases-without-npm.md`
