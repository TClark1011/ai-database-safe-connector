# Database-enforced access through a Safe Schema

The agent's SQL runs as an Agent User that has SELECT on the Safe Schema only: a schema of views, generated from the Column Allowlist, exposing allowed columns and keyed hashes of Obfuscated Columns. The database is the only thing that decides what the agent can read. The MCP neither parses the SQL nor filters results. Each query also runs in a read-only transaction as a second layer.

## Considered Options

- **Filter results in the MCP** (rejected): hidden columns still leak through `WHERE`, `ORDER BY` and `JOIN` (e.g. `WHERE password_hash LIKE 'a%'`), through expressions and `UNION`s that carry no or misleading column metadata, and through equality checks against Obfuscated Columns.
- **Parse SQL in the MCP and reject hidden-column references** (rejected): any gap in the parser or MySQL dialect coverage becomes a security hole.

## Consequences

- Sync needs Admin Credentials with `CREATE USER`, `CREATE`, `CREATE VIEW` and `GRANT OPTION`. A plain read/write application user isn't enough.
- The views' `DEFINER` account must keep its privileges, or the views stop working. Sync never writes an explicit `DEFINER`, so views always belong to the admin account running Sync: managed providers don't grant `SUPER`, and Azure has no `SET_USER_ID`, so a separate definer account isn't portable. When Sync reads applied state, a view whose `DEFINER` isn't `CURRENT_USER()` (for example after the developer changed Admin Credentials) is drift, and Sync recreates it without approval since exposure is unchanged. Queries failing because a definer lost privileges or no longer exists trigger a Sync and one retry (ADR 0012).
- The Agent User must never be granted `EXECUTE`, `FILE` or `SHOW VIEW`: `DEFINER` stored functions could write data, and view definitions show how values are hashed and where the hash secret lives (ADR 0003).
- Unrestricted Environments have no Safe Schema; the Agent User gets a direct grant on the database instead (ADR 0009).
