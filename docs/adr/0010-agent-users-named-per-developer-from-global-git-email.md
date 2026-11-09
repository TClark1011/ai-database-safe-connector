# Agent Users and Safe Schemas are named per developer from the global git email

Each developer gets their own Agent User and Safe Schema per Environment, both named `<h>_agent_<env>`, where `<h>` is the first 8 hex characters of the SHA-256 of the lowercased, trimmed `git config --global user.email`. Developers sharing a server, such as a staging database, each get their own, so differing Column Allowlists on different branches don't overwrite each other. Only the global git config is read, because the repository's `.git/config` is inside the project and the agent can write to it; switching to a teammate's email would let it narrow the teammate's access without approval. With no global email set, the MCP fails closed.

V1 supports one project per database server, so the name has no project component. Before changing an existing Agent User, Sync checks that its grants and its Safe Schema's view sources refer only to this Environment's database and its own `<h>_secret_<env>` schema (ADR 0003), and stops without changing anything if they don't. That catches a second project on the same server unless both point at the same database.

The agent writes unqualified table names. The MCP sets each connection's default database to the Safe Schema, or to the real database in an Unrestricted Environment, and resets it for every query, so one query works in every Environment without the MCP rewriting SQL (ADR 0001).

## Considered Options

- **Per database** (rejected): every project and developer targeting a database shares one Safe Schema, which flips between versions on every Sync.
- **Per Environment, shared by all developers, with a project ID in the Project Config** (rejected): differing allowlists overwrite each other, and the hash secret would have to be shared between developers.
- **Per project folder path** (rejected): every worktree needs its own credential setup.
- **Effective git email, including the repository's config** (rejected): writable by the agent.

## Consequences

- Environment names must match `^[a-z0-9][a-z0-9_-]{0,16}$` so the name fits MySQL's 32-character user name limit.
- The Agent User's host is `'%'`; access relies on the keychain password, TLS and the server's network rules.
- Hash secrets are per developer and Environment (ADR 0003).
