# Sync runs lazily before each query

The MCP runs Sync for an Environment just before a query to it, never at startup or on a file watch. A full diff (ADR 0011) runs when the Environment hasn't been synced yet in this MCP process, when the Project Config's hash has changed, when a fixed 5-minute TTL has expired, or when a query fails with an unknown column or table error (MySQL 1054/1146) or a view definer error (1356/1449, ADR 0001), after which the query is retried at most once. A config edit that narrows access therefore applies before the next query, while schema drift, which can only produce Widening Changes, is picked up within the TTL. For an Unrestricted Environment the check only reads the grant (ADR 0009).

If the triggered Sync doesn't complete, for any reason (invalid config, missing credentials, unreachable server, failed ownership check, failed statement), the query is refused with the cause and the next query retries. No query runs on an applied state that might still be wider than the config.

The Widening Change approval is an elicitation inside the query's tool call. A decline, cancel or timeout leaves the widening at its applied level, the query still runs, and the tool result says the widening was declined. The decline is remembered only in memory, keyed by the Environment and the exact set of widening rows, so the human is prompted again only when that set changes or a new MCP process starts.

Sync is serialized per Environment within a process and per Agent User across processes with MySQL `GET_LOCK`. The lock is held while diffing and applying, but not during the elicitation, because a human may take minutes to answer. After approval Sync takes the lock again, re-runs the diff, and applies only approved rows that are still widening; any new widening rows get their own prompt. A lock timeout is a failed Sync.

## Considered Options

- **Sync every Environment at startup** (rejected): opens admin connections for Environments the session never queries, and misses mid-session config edits.
- **Full diff on every query** (rejected): every query pays for reading `information_schema`, grants and views.
- **File watch** (rejected): Syncs outside a tool call, where there's no request to attach the elicitation to.
- **Let queries run on the applied state when Sync fails** (rejected): without a finished diff there's no knowing whether a narrowing is pending.
- **Persist rejections to a file** (rejected): a stored state file the agent could tamper with (ADR 0002), even if the worst case is only suppressed prompts.
- **Hold the lock through the elicitation** (rejected): blocks other sessions' Syncs, and so their queries, for as long as the human takes.

## Consequences

- An allowlisted column added to the database stays hidden for up to the TTL, unless a query names it.
- The agent can trigger approval prompts by querying unknown names; each one still needs a human, and the in-memory record stops repeats within a session.
- Every new session asks again about a widening the human already declined.
- An Environment removed from the Project Config can't be queried, but its Agent User, Safe Schema and hash secret stay in the database until the developer removes them with the setup CLI, since the config no longer says where they are.
