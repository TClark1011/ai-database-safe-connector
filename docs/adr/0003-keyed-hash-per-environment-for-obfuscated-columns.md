# Keyed hash per Environment for Obfuscated Columns

Obfuscated Columns are shown to the agent as a keyed hash of each value, with NULLs left visible, using a secret stored per developer and Environment. The secret stops the agent confirming guesses by hashing candidate values itself, and making it per Environment stops it linking records between Environments. Because it is also per developer (ADR 0010), teammates' agents see different hashes for the same value. There is no reversible encryption and no lookup tool: humans who need the real value query it by ID with their own access.

## Where the secret lives

The hash is HMAC-SHA256 built from nested `SHA2`, since MySQL has no native HMAC. The secret exists only in the database: Sync generates it in Node and stores only its HMAC pads (`ipad`, `opad`) in a one-row table, `secret`, in a private schema per Agent User named `<h>_secret_<env>`, which can't collide with any `<h>_agent_<env>`. The table enforces a single row with a constant primary key and a `CHECK`. The Agent User has no grant on that schema; the views read it with their `DEFINER`'s privileges.

A view with Obfuscated Columns reads the pads through `CROSS JOIN <h>_secret_<env>.secret`, so the secret never appears in view text and the view stays mergeable. Views with no Obfuscated Columns don't join it. If the row is missing, those views return no rows rather than wrong hashes; Sync treats a missing row as unreadable applied state (ADR 0011) and writes a new secret, changing every Obfuscated value the agent sees, without approval since exposure is unchanged.

## Considered Options

- **Unkeyed hash** (rejected): the agent can hash guesses, such as common emails, and compare.
- **Deterministic encryption with a decryption key** (rejected): a leaked key exposes every value the agent has seen, and MySQL's default `AES_ENCRYPT` mode (ECB) leaks patterns.
- **One secret per project** (rejected): lets the agent link records across Environments.
- **Pads as literals in each view definition** (rejected): the only barrier is the Agent User never seeing view text, and the edge cases of that (`EXPLAIN`, `INFORMATION_SCHEMA.VIEWS`, optimizer trace, error text) vary by MySQL version.
- **Reading the secrets table through a scalar subquery** (rejected): a subquery in the select list prevents merging, so every query would materialize the whole base table.
- **One secrets schema per developer, with a row per Environment** (rejected): fewer schemas, but a Sync bug could point one Environment's views at another's row, and `remove` couldn't simply drop a schema.
- **A copy of the secret in the keychain** (rejected): it would only let a lost secrets table be restored with the same hashes, at the cost of a second copy to keep in step.
- **Secret-prefix hash such as `SHA2(CONCAT(secret, value), 256)`** (rejected): SHA-256 is length-extendable.

## Consequences

- Each restricted Environment has one more schema per developer, which Sync creates and `remove` drops (ADR 0013). Unrestricted Environments have none, so switching to unrestricted and back changes the hashes.
- Anyone who can read binlogs, dumps or the admin's statement history can read the pads; they can read the raw values too.
- Values are hashed as explicit canonical bytes, with explicit casts for numbers and temporals, since implicit conversion formats aren't fully documented.
- Tests against a real MySQL must cover: the views merging with the secrets table read as a constant, the Agent User being unable to read the pads by any route, and the SQL HMAC matching `node:crypto` for every supported column type and NULL.
