# Keychain entries are keyed by connection, and Sync generates the Agent User's secrets

All keychain entries share one service name and are keyed by the connection they belong to, never by Environment name alone: `admin:<host>:<port>` holds Admin Credentials, one per server and shared by every Environment on it, and `agent:<host>:<port>:<agent user>` holds the Agent User's password and hash secret plus the `database` and `tls` settings last synced. Hosts are lowercased and ports always explicit. When the Project Config's host for an Environment changes, the lookup misses and the query is refused until the human runs setup for the new host, so editing the Project Config can't redirect stored Admin Credentials to another server.

The setup CLI only collects Admin Credentials. Sync generates the Agent User password and hash secret the first time it creates an Agent User, and regenerates both when an Agent User exists but its entry is missing: it runs `ALTER USER` and rebuilds the Safe Schema views without approval, since exposure is unchanged. The MCP writes to the keychain, which is outside the agent's reach (ADR 0007).

## Setup CLI commands

- `setup`: for each server the Project Config's Environments use, prompt for missing Admin Credentials, check the connection and the privileges Sync needs, then store them. Re-running it rotates Admin Credentials.
- `remove <env>`: drop the Agent User and Safe Schema and delete the agent entry, working from the keychain alone, so it also covers Environments gone from the Project Config or moved to another host (it asks which if the name matches on several hosts). For an Environment still in the Project Config this is a reset: the next query's Sync rebuilds it from an empty applied state, so the whole Environment needs approval again.
- `rotate <env>`: delete the agent entry only; the next Sync regenerates the password and hash secret, changing every Obfuscated value the agent sees.
- `status`: list entries and flag stale ones, meaning agent entries on this project's servers whose Agent User isn't a current `<h>_agent_<env>`, such as a removed Environment or a changed global git email. The MCP also warns about them in a query result once per process.

## Considered Options

- **Keyed by Environment name plus a project identity** (rejected): a project identity isn't needed elsewhere yet (ADR 0010), and a changed host in the Project Config would receive the stored Admin Credentials.
- **Setup CLI generates every secret** (rejected): every new Environment needs a setup run, and a lost entry has no recovery path short of a reset.
- **Separate entries for the password and hash secret** (rejected): both are created together, and one entry halves the macOS keychain prompts.
- **Separate `reset` and `remove` commands** (rejected): they run the same statements; whether the Environment comes back depends only on the Project Config.
- **Linux keyutils fallback** (rejected): entries are lost on reboot and may not be visible to the MCP's process. The keyring is pinned to Secret Service and fails closed without it, leaving headless Linux unsupported in V1.

## Consequences

- Changing an Environment's host, including `localhost` to `127.0.0.1`, needs a setup run.
- `remove` and stale-entry detection list entries with `findCredentials`; on Windows and Linux one unreadable entry fails the whole listing, so both fail closed.
- No automatic rotation in V1.
