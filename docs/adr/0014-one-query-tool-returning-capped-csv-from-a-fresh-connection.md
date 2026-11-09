# One query tool returning capped CSV from a fresh connection

The MCP exposes a single tool, `query`, taking a required `environment` and one SQL statement. The agent works inside the project's codebase, so it learns the schema from the code and reads the Project Config to see which columns are allowlisted and obfuscated; a schema or Environment-listing tool would only repeat what it can already read. The MCP process belongs to one Harness session and loads `ai-db-safety.json` from the project root passed as `--project-dir` (in Claude Code, `${CLAUDE_PROJECT_DIR}`), refusing every query when it is missing rather than guessing from the working directory.

Each query runs on a fresh connection that sets the default database (ADR 0010), `time_zone = '+00:00'` and `max_execution_time` of 30 seconds, then runs the statement in a read-only transaction and closes. Multiple statements per call are disabled. Nothing the agent `SET`s outlives its call, and because a `MAX_EXECUTION_TIME` optimizer hint in the agent's SQL replaces the session timeout, the MCP also runs a watchdog that issues `KILL QUERY` from a second Agent User connection once the limit plus a short grace has passed. MySQL lets an account kill its own threads without extra privileges. Statement types are not filtered (ADR 0001).

The result is a CSV text block, always with a header row, followed by a notes block only when there is something to report, such as truncation or a declined Widening Change (ADR 0012). Failures are tool errors with a plain-text cause and no CSV. An unquoted empty field is NULL and `""` is an empty string. Values keep MySQL's text form: dates as strings, `TIMESTAMP` in UTC, `BIGINT` and `DECIMAL` as exact strings, binary as `0x` hex, JSON as compact JSON text. Results stop at 1000 rows or 40,000 characters, whichever comes first, cut at a row boundary with a note; rows are streamed and reading stops at the cap. The character cap keeps a result under Claude Code's 10,000-token warning and the 50,000-character limit above which it saves tool output to a file.

## Considered Options

- **A `describe_schema` or `list_environments` tool** (rejected): the codebase and the Project Config already say this, and a second code path describing access could drift from the grants.
- **Find the project root from the working directory or `roots/list`** (rejected): Claude Code doesn't document the working directory of plugin MCP servers, nor the order of roots.
- **A connection pool reset between queries** (rejected): relies on the reset clearing every session variable the agent might set, now and in future MySQL versions.
- **Client-side timeout only** (rejected): dropping the socket leaves the query running on the server.
- **A `NULL` token in CSV** (rejected): indistinguishable from the string `'NULL'`.
- **JSON results** (rejected): several times the tokens of CSV for the same rows.
- **An agent-set row limit** (rejected): lets one call flood the context; `LIMIT` in SQL already narrows results.

## Consequences

- Every query pays a connect and TLS handshake.
- The agent's code-derived picture includes hidden columns; querying one fails with an unknown column error, which also triggers the Sync retry from ADR 0012.
- The Environment parameter is a plain string checked against the Project Config at call time, since the config can change after the tool list is published.
- Time spent in Sync or waiting on an approval doesn't count toward the 30 seconds.
