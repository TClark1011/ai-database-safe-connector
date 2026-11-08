# AI Database Safe Connector

Lets an AI agent read from a database without exposing credentials, writable access, or columns the developer has not approved.

## Access control

**Column Allowlist**:
The developer-defined list of columns the agent may read, as Full Columns or Obfuscated Columns. Every column not on it is hidden. One Column Allowlist applies to every restricted Environment.
_Avoid_: Whitelist, column permissions

**Global Column Allowlist**:
Base column rules applied to every table on the Column Allowlist, such as standard `id` and `created_at` columns. A table's own rules override them, including hiding a column. It never brings a table onto the Column Allowlist.
_Avoid_: Default columns, common columns

**Full Column**:
An allowlisted column the agent sees with its real values.
_Avoid_: Plain column, visible column

**Obfuscated Column**:
An allowlisted column the agent sees only as a keyed hash of each value, with NULLs left visible, so it can match values without reading them.
_Avoid_: Hashed column, masked column

**Project Config**:
The file in a project that holds its Column Allowlist and Environments, never credentials or secrets. The agent may read it but not edit it.
_Avoid_: Settings file, allowlist file

**Environment**:
A human-readable label in the Project Config, such as "prod" or "dev", mapped to the connection settings of one database. The agent picks one per query.
_Avoid_: Stage, target, database alias

**Unrestricted Environment**:
An Environment where the agent may read every column of every table in its database, with no Column Allowlist or Safe Schema. Meant for databases with no real personal data, such as dev or staging.
_Avoid_: Open environment, trusted environment

**Widening Change**:
A change to the Project Config that exposes more data to the agent than the last applied version. It needs human approval before it takes effect.
_Avoid_: Permission escalation

## Database

**Agent User**:
The SELECT-only database account the agent's queries run as, one per developer and Environment, with access to its Safe Schema, or its whole database in an Unrestricted Environment.
_Avoid_: Read-only user, AI user

**Admin Credentials**:
The developer's privileged database credentials, used only to run Sync and never on the query path.
_Avoid_: Root credentials, master credentials

**Safe Schema**:
The database schema of views, generated from the Column Allowlist, that is all the Agent User can see in a restricted Environment. Each Agent User has its own.
_Avoid_: View schema, shadow schema

**Sync**:
Rebuilding the Safe Schema and the Agent User's grants so they match the Project Config.
_Avoid_: Provisioning, migration

**Database Adapter**:
The engine-specific implementation of Sync and query execution, such as MySQL.
_Avoid_: Driver, connector

## Harnesses

**Harness**:
An AI agent application that hosts the agent and its tools, such as Claude Code.
_Avoid_: Client, host app

**Harness Plugin**:
A package that bundles the harness-agnostic components and configures them for one Harness.
_Avoid_: Integration, extension
