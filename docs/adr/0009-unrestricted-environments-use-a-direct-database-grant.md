# Unrestricted Environments use a direct database grant

In an Unrestricted Environment the Agent User is granted `SELECT ON <database>.*` on the real database, with no Safe Schema. New tables and columns are visible without Sync, so a database with no real personal data needs no allowlist upkeep. Every other layer from ADR 0001 still applies: the grant covers that one schema only, each query runs in a read-only transaction, and the Agent User never gets `EXECUTE`, `FILE` or `SHOW VIEW`.

Making an Environment unrestricted, or adding an Unrestricted Environment, is a Widening Change. The approval prompt states that the agent will be able to read every column of every table in the database on that host. That approval is the only guard against an Unrestricted Environment pointing at a restricted Environment's database: matching host and database names is easy to get past (`localhost` vs `127.0.0.1`, DNS aliases), so it isn't attempted.

## Considered Options

- **Safe Schema of all-column views** (rejected): one code path, but tables and columns added later stay invisible until Sync notices schema drift, which brings back the upkeep this mode exists to remove, and views stacked over the database's own views can break.

## Consequences

- Sync has two grant models. Which one is applied is read from the Agent User's grants, keeping the applied state in the database (ADR 0002).
- Switching to restricted narrows access and applies at once, failing closed: revoke the database grant first, then build the Safe Schema and grant on it.
- Switching to unrestricted grants the database after approval, then drops that Environment's Safe Schema and hash secret.
- The database's own views run with their DEFINER's privileges, so the Agent User may read data they reach in other schemas.
