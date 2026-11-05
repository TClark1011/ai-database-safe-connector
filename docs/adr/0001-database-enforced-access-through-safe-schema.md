# Database-enforced access through a Safe Schema

The agent's SQL runs as an Agent User that has SELECT on the Safe Schema only: a schema of views, generated from the Column Allowlist, exposing allowed columns and keyed hashes of Obfuscated Columns. The database is the only thing that decides what the agent can read. The MCP neither parses the SQL nor filters results. Each query also runs in a read-only transaction as a second layer.

## Considered Options

- **Filter results in the MCP** (rejected): hidden columns still leak through `WHERE`, `ORDER BY` and `JOIN` (e.g. `WHERE password_hash LIKE 'a%'`), through expressions and `UNION`s that carry no or misleading column metadata, and through equality checks against Obfuscated Columns.
- **Parse SQL in the MCP and reject hidden-column references** (rejected): any gap in the parser or MySQL dialect coverage becomes a security hole.

## Consequences

- Sync needs Admin Credentials with `CREATE USER`, `CREATE`, `CREATE VIEW` and `GRANT OPTION`. A plain read/write application user isn't enough.
- The views' `DEFINER` account must keep its privileges, or the views stop working.
- The Agent User must never be granted `EXECUTE`, `FILE` or `SHOW VIEW`: `DEFINER` stored functions could write data, and view definitions contain the hash secret.
