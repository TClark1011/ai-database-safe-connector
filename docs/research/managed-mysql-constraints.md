# Managed MySQL constraints

Research for issue #15 (child of map #4). Question: on RDS, Aurora, Cloud SQL, Azure Database for MySQL and PlanetScale, can Admin Credentials do what [ADR 0001](../adr/0001-database-enforced-access-through-safe-schema.md) needs (`CREATE USER`, `CREATE`, `CREATE VIEW`, `GRANT OPTION`, views with a `DEFINER`, read-only transactions)? Which providers break the design?

No database was connected to. Everything below is from vendor docs read on 2026-11-06 unless marked "unverified".

## Answer

- RDS for MySQL, Aurora MySQL v3 and Azure Database for MySQL flexible server: the design works, provided views use the Admin Credentials account itself as `DEFINER` (the default, `CURRENT_USER`) rather than a separate definer account.
- Cloud SQL for MySQL: very likely works on the same terms, but its docs do not list `CREATE USER` or `GRANT OPTION` explicitly. Needs a live check before committing.
- PlanetScale (Vitess) breaks the design: no native MySQL users or grants, so no `CREATE USER`, no SELECT-only Agent User, and no `GRANT`. Views are experimental. Out of scope for the MySQL adapter unless a different enforcement model is designed.
- `SUPER` is unavailable on every managed provider, so Sync must not depend on it. `SET_USER_ID` is available on RDS/Aurora, but not on Azure and probably not on Cloud SQL 8.0.28+. Sync should therefore never set a `DEFINER` other than the admin's own account.

| Capability                      | RDS MySQL                                                     | Aurora MySQL v3         | Cloud SQL MySQL                                                                                            | Azure flexible server                                                                                | PlanetScale (Vitess)                                                                                   |
| ------------------------------- | ------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CREATE USER`                   | Yes (documented)                                              | Yes (documented)        | Not explicitly documented; users are creatable and get `cloudsqlsuperuser`                                 | Yes (documented)                                                                                     | No: native user management unsupported                                                                 |
| `CREATE` / `CREATE VIEW`        | Yes                                                           | Yes                     | Not listed explicitly; role has "all static privileges except SUPER and FILE"                              | Yes                                                                                                  | Views experimental, same-keyspace only; direct DDL blocked on production branches with safe migrations |
| `GRANT OPTION`                  | Role has `WITH GRANT OPTION`; master user holds the role      | Same as RDS             | Not documented (unverified)                                                                                | Docs example grants `WITH GRANT OPTION` on `*.*`; admin's privilege list does not name it (inferred) | No `GRANT`                                                                                             |
| `DEFINER` = admin's own account | Yes (MySQL rule, no extra privilege)                          | Yes                     | Yes (MySQL rule)                                                                                           | Yes (MySQL rule)                                                                                     | n/a                                                                                                    |
| `DEFINER` = another account     | Yes: `SET_USER_ID` held                                       | Yes: `SET_USER_ID` held | 8.0.18 to 8.0.27 listed with it; not listed from 8.0.28; 8.4 replaced by `SET_ANY_DEFINER` (grant unclear) | No: `SUPER` required and restricted; `SET_USER_ID` not in supported dynamic privileges               | n/a                                                                                                    |
| `SUPER` / `SYSTEM_USER`         | `SUPER` not in privilege list; `SYSTEM_USER` not in list      | Not in list             | `SUPER` and `FILE` excluded; `SYSTEM_USER` not documented                                                  | `SUPER` restricted; `SYSTEM_USER` not in supported dynamic privileges                                | n/a                                                                                                    |
| Separate schema for views       | Yes (`CREATE` is global)                                      | Yes                     | Yes, but `mysql` schema DDL unsupported                                                                    | Yes                                                                                                  | No: cannot create a logical database                                                                   |
| `START TRANSACTION READ ONLY`   | Standard MySQL, no privilege needed (unverified per provider) | Same                    | Same                                                                                                       | Same                                                                                                 | Syntax listed as supported by Vitess; enforcement unverified                                           |

## Details

### How `DEFINER` works (all providers)

- With `SET_USER_ID` (or deprecated `SUPER`) you may name any account as `DEFINER`. Otherwise "the only permitted account is your own", literally or as `CURRENT_USER`. Naming a definer that holds `SYSTEM_USER` also requires you to hold `SYSTEM_USER` ([MySQL 8.0: Stored object access control](https://dev.mysql.com/doc/refman/8.0/en/stored-objects-security.html)).
- Default `DEFINER` is the account that runs `CREATE VIEW` ([MySQL 8.0: CREATE VIEW](https://dev.mysql.com/doc/refman/8.0/en/create-view.html)). At query time, base-table privileges are checked against the definer when `SQL SECURITY DEFINER` (the default).
- Consequence for ADR 0001: the views' definer needs `SELECT` on the base tables for as long as the views live. Using the admin account as definer satisfies this on every provider where views work. The cost is that the views keep working only while the admin account keeps its privileges, and rotating or dropping the admin user breaks every view. This ties the Safe Schema's lifetime to the Admin Credentials account.
- A dedicated low-privilege definer account (the cleaner design) needs `SET_USER_ID` or `SET_ANY_DEFINER` to create views, which Azure does not offer.
- I could not confirm from a fetched page that MySQL 8.2+ replaced `SET_USER_ID` with `SET_ANY_DEFINER` for this check in community MySQL. Cloud SQL's docs say its 8.4 image does so (see below). Treat the community-MySQL detail as unverified.

### RDS for MySQL and Aurora MySQL

- RDS for MySQL 8.0.36+ and Aurora MySQL v3 give the master user `rds_superuser_role`, which includes `CREATE USER`, `CREATE VIEW`, `CREATE`, `SET_USER_ID`, `SHOW VIEW`, `EXECUTE`, and "includes `WITH GRANT OPTION` so that an administrative user can grant that role to other users" ([RDS privilege model](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.MySQL.CommonDBATasks.privilege-model.html), [Aurora v3 comparison](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Compare-80-v3.html)).
- The master user table for MySQL before 8.0.36 lists `CREATE USER`, `CREATE VIEW`, `CREATE` but not `SET_USER_ID` and does not name `GRANT OPTION` ([master user privileges](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.MasterAccounts.html)). Older RDS versions can only use the admin account as definer, and whether the master user can re-grant privileges there is unverified from these pages.
- Direct writes to `mysql.*` tables are blocked from 8.0.36 (RDS) and on Aurora v3; Sync must use `CREATE USER` / `GRANT` statements only. This is already the plan.
- `SUPER` and `SYSTEM_USER` are not in either list. Aurora v3 follows MySQL 8.0.23 features, with some later features backported; not an issue for this design.

### Cloud SQL for MySQL

- MySQL 8.0 and later: created users are auto-granted the `cloudsqlsuperuser` role (all static privileges except `SUPER` and `FILE`). The built-in `root@%` "has all database privileges except for" `SUPER` and `FILE`. `SET_USER_ID` is listed for 8.0.18 to 8.0.27 and not for 8.0.28+; in 8.4 it is "removed and replaced" by `ALLOW_NONEXISTENT_DEFINER` and `SET_ANY_DEFINER` ([Cloud SQL users](https://docs.cloud.google.com/sql/docs/mysql/users)).
- The page does not mention `GRANT OPTION`, `CREATE USER` or `SYSTEM_USER`. "All static privileges except SUPER and FILE" implies `CREATE USER`, `CREATE VIEW` and `GRANT OPTION` for 8.0 (inference, not stated). Whether the 8.4 and 9.x roles include `SET_ANY_DEFINER` is not stated.
- Limitation: `cloudsqlsuperuser` cannot run DDL against the `mysql` system schema; access to some system procedures and tables is restricted.

### Azure Database for MySQL flexible server

- The server admin has `CREATE USER`, `CREATE VIEW`, `SHOW VIEW`, `CREATE`, `EXECUTE`, etc., and `SUPER` and the DBA role "aren't supported" ([create users](https://learn.microsoft.com/en-us/azure/mysql/flexible-server/how-to-create-users)). The same page grants a new admin-like user `... ON *.* ... WITH GRANT OPTION` from the admin account, which indicates the admin can re-grant.
- Supported dynamic privileges (8.0+) are only `REPLICATION_APPLIER`, `ROLE_ADMIN`, `SESSION_VARIABLES_ADMIN`, `SHOW ROUTINE`, `XA_RECOVER_ADMIN`. No `SET_USER_ID`. "`DEFINER` requires `SUPER` privileges to create and is restricted" ([limitations](https://learn.microsoft.com/en-us/azure/mysql/flexible-server/concepts-limitations)).
- Net effect: views must use the admin as `DEFINER`. This works, subject to the lifetime caveat above.

### PlanetScale (Vitess)

- "Vitess does not support MySQL's native user and privilege management." Credentials are created through the dashboard, API, CLI or password roles. "We do not support any form of stored routines." You cannot create a logical database. Direct DDL is blocked on production branches when safe migrations is on ([PlanetScale MySQL compatibility](https://planetscale.com/docs/vitess/troubleshooting/mysql-compatibility.md)).
- Vitess views are "supported for sharded keyspaces as an experimental feature", need flags on VTGate and VTTablet, must reference tables in the same keyspace, and are read-only ([Vitess 21.0 compatibility](https://vitess.io/docs/21.0/reference/compatibility/mysql-compatibility/)). That page does not cover users or grants. The PlanetScale page does not mention views. The Vitess docs may not describe PlanetScale's managed behaviour; treat view support on PlanetScale as unverified.
- Result: no per-column Agent User can be created with SQL, so ADR 0001's enforcement mechanism does not exist there. A PlanetScale "read-only" password role would give table-level, not column-level, restriction (what each role grants was not verified), which does not meet the Column Allowlist guarantee.

### `START TRANSACTION READ ONLY`

- It is a standard MySQL transaction characteristic, not a privileged operation. The Vitess page lists `READ ONLY` as a supported `START TRANSACTION` characteristic. I did not retrieve the MySQL manual page for it (the 8.0 URL I tried returned 404), and none of the managed-provider docs I read restrict it. Treat as very likely available everywhere except unconfirmed on PlanetScale. Since it is only the second layer in ADR 0001, its absence would not break the primary control.

## Implications for the design

- Sync should create views with the default definer (the admin account) and must not emit `DEFINER = <other>`. This works on every viable provider and avoids needing `SET_USER_ID`/`SUPER`.
- ADR 0001's "views' `DEFINER` account must keep its privileges" now has a sharper form: on Azure, and anywhere the definer is the admin, rotating or deleting the admin user breaks the Safe Schema. Worth stating in the ADR or setup docs.
- PlanetScale should be listed as unsupported for the MySQL adapter. Supporting it would need a new enforcement model, which is outside ADR 0001.
- Cloud SQL needs a one-off verification on a real instance: `SHOW GRANTS` for the admin user, and `CREATE USER` / `GRANT ... WITH GRANT OPTION` on `safe_schema.*` (not tried here).

## Not verified

- Cloud SQL `GRANT OPTION`, `CREATE USER`, `SYSTEM_USER` and 8.4 `SET_ANY_DEFINER` membership (docs silent).
- RDS pre-8.0.36 re-grant ability (pages do not name `GRANT OPTION` there).
- Azure admin's explicit `GRANT OPTION` (inferred from an example).
- Whether MySQL community 8.2+ moved the definer check to `SET_ANY_DEFINER`.
- `READ ONLY` transaction behaviour on each provider and via Vitess (not confirmed in provider docs).
- PlanetScale view availability and what its password roles permit.
- Grant behaviour was not tested; no database was connected to.
