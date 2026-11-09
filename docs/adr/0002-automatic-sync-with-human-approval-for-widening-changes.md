# Automatic Sync, with human approval for Widening Changes

The MCP runs Sync by itself when the Project Config differs from the Safe Schema in the database, so developers have no manual step to remember. Changes that narrow access apply straight away. A Widening Change (more columns, plainer access, or a new or changed Environment) waits until a human approves it through an MCP elicitation, which only the human can answer, never the model. The prompt shows exactly what gets wider. Harnesses without elicitation fall back to an approval command the human runs in a terminal.

The applied state is read from the database itself, so there's no separate "last approved" file for the agent to tamper with. How the diff is computed is in ADR 0011.

## Considered Options

- **Manual Sync command** (rejected): something a human has to remember to run.
- **Automatic Sync with no approval** (rejected): the agent could grant itself any column by getting the config changed.
- **Only generate the SQL for a human to run** (rejected): most secure, since the MCP never holds Admin Credentials, but it's a manual step.

## Consequences

The MCP process holds Admin Credentials. Sync uses them on its own connection, which must never be reachable from the query path.
