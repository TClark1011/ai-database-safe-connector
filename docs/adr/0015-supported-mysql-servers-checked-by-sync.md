# Supported MySQL servers checked by Sync

V1 supports MySQL 8.0, 8.4 and 9.7, at the engine level rather than per provider. 8.0 stays supported after its April 2026 end of life because some developers can't move off it yet, such as those on paid RDS extended support. Tests against a real MySQL run on 8.0.46, the final 8.0 release, and on the latest 8.4 and 9.7 patches. There is no minimum patch version: the design uses no version-specific features (default `DEFINER`, plain grants, no roles, no `SET_USER_ID`), so other versions aren't known to break, only untested.

Before changing anything, Sync reads `VERSION()` and `@@version_comment` over the admin connection:

- It refuses servers below 8.0, and servers whose version string names MariaDB, Vitess (including PlanetScale) or TiDB. These differ in the grants, views and `SHOW VIEW` behaviour the design relies on, or have no native users and grants at all.
- It proceeds on any other 8.0 or later version that isn't tested, such as an older 8.0 patch or an Innovation release, and adds a note to the query result's notes block (ADR 0014).
- In a restricted Environment, it refuses if `SHA2('', 256)` returns NULL, which happens on MySQL builds without SSL. Otherwise every Obfuscated Column would silently read as NULL.

A refusal is a failed Sync, so the query is refused with the cause (ADR 0012).

Providers are documented, not detected:

| Provider                                                          | Status                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Self-hosted, Docker                                               | Tested                                                                                       |
| AWS RDS MySQL, Aurora MySQL v3, Azure Database for MySQL flexible | Compatible per provider docs, not live-tested                                                |
| Google Cloud SQL, other managed MySQL                             | Expected to work, unverified: docs don't state `CREATE USER` or `GRANT OPTION` for Cloud SQL |
| PlanetScale (Vitess), MariaDB, TiDB                               | Refused by Sync                                                                              |

The tools need Node.js 24 or later. The floor is the oldest Node LTS line still supported upstream; it rises only when that line reaches end of life, and raising it is a breaking change. Tests run on the floor and on the development version. Each bundle checks `process.versions.node` at startup and exits with a clear error on an older Node, since there is no npm `engines` check (ADR 0008).

## Considered Options

- **LTS releases only (8.4, 9.7)** (rejected): leaves out developers still on 8.0.
- **Refuse every version that isn't tested** (rejected): blocks Innovation releases, whose grant and view semantics match the LTS releases.
- **Never refuse, warn only** (rejected): MariaDB, Vitess and TiDB would run Sync against semantics the security model wasn't built for.
- **Detect the provider at runtime to warn on unverified ones** (rejected): hostnames and server variables are brittle signals, and a provider that lacks a needed privilege already fails Sync with a privilege error.
- **A hard minimum 8.0 patch** (rejected): no known patch is required, so a floor would only block working servers.

## Consequences

- The supported list includes a release that no longer gets security patches; the server's security is the developer's responsibility.
- An untested version can break at runtime rather than at a clear check.
- MySQL-compatible engines not on the refused list, if they don't name themselves in the version string, aren't caught.
