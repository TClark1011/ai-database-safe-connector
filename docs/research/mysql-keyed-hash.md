# Keyed hash options in MySQL

Resolves #14 (child of #4). Research only: nothing here was run against a database. Items marked **Unverified** need a Testcontainers check before the design relies on them.

## Answer

- MySQL has **no native HMAC** in 8.0, 8.4 or 9.x. The only general-purpose keyed-hash building block is `SHA2(str, 224|256|384|512)`, which is unchanged across those versions as far as the manuals show.
- **Recommended: real HMAC-SHA256 built from `SHA2` with precomputed pads.** Sync computes `K XOR ipad` and `K XOR opad` (64 bytes each) in TypeScript and embeds them as hex literals. The view expression is then two nested `SHA2` calls, with no XOR in SQL and no MySQL-version dependence beyond `SHA2`. This is the standard construction (RFC 2104), so no bespoke soundness argument is needed.
- **Avoid `SHA2(CONCAT(secret, value), 256)`**: secret-prefix with SHA-256 is length-extendable. Exploitability here is low (the agent can only read), but a standard construction costs almost nothing extra. `SHA2(CONCAT(secret, value), 384)` is not length-extendable (truncated state) but is non-standard; treat it as a fallback only.
- **The secret (or its pad values) will sit in the view definition.** It is hidden from the Agent User only because that user lacks `SHOW VIEW`. It also lands in binlogs, dumps, general/audit logs and Performance Schema statement history, all admin-side. An alternative is a private one-row secrets table read by the view, which keeps the secret out of the definition (trade-offs below).
- **NULL**: `SHA2(NULL, n)` and `CONCAT(..., NULL)` both return `NULL`, so NULLs stay visible with no `CASE` needed. **Types**: hash an explicit canonical byte string (`CAST(col AS BINARY)` for strings, explicit casts for numbers and temporals) rather than relying on implicit conversion.

## Constructions

Notation: `v` is the column value, `K` the per-Environment secret, `B = 64` the SHA-256 block size.

| Option                        | Expression sketch         | Verdict                                                                 |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Secret-prefix, SHA-256        | `SHA2(CONCAT(K, v), 256)` | Length-extendable. Avoid.                                               |
| Secret-prefix, SHA-384        | `SHA2(CONCAT(K, v), 384)` | Not length-extendable, non-standard. Fallback.                          |
| Secret-suffix                 | `SHA2(CONCAT(v, K), 256)` | Not length-extendable, but weak if the hash is collision-broken. Avoid. |
| HMAC-SHA256, precomputed pads | see below                 | Recommended.                                                            |

Recommended expression (sketch, **Unverified** as MySQL syntax, validate against `node:crypto` `createHmac`):

```sql
SHA2(
  CONCAT(
    X'<K XOR opad, 64 bytes>',
    UNHEX(SHA2(CONCAT(X'<K XOR ipad, 64 bytes>', CAST(`col` AS BINARY)), 256))
  ),
  256
)
```

- `K` is zero-padded to 64 bytes (or, if longer than 64 bytes, hashed first) before XOR with `0x36` / `0x5C` per RFC 2104. Use a random key of at least 32 bytes.
- `UNHEX(SHA2(...))` yields raw bytes for the outer hash input, as HMAC requires (hex text would not be HMAC).
- Output is 64 hex chars; truncating is allowed by RFC 2104 (at least half the hash length, at least 80 bits) if shorter values are wanted for token cost.
- If doing the XOR in SQL instead: MySQL 8.0+ supports `^` on binary strings but requires equal lengths (error 3513 otherwise). Precomputing avoids this.
- `K XOR ipad` is trivially reversible to `K`, so the pad literals are as secret as `K` itself.
- Domain separation: the same value in two columns hashes identically (useful for joins, but also lets the agent link columns). Prefixing the table and column name inside the inner message makes per-column hashes distinct. This is a design choice for an ADR 0003 follow-up, not a soundness requirement.

## Versions

- `SHA2` documented identically in 8.0, 8.4 and 9.x manuals: accepts 224/256/384/512 (0 = 256), `NULL` on `NULL` input or invalid length.
- `SHA2` **only works if MySQL was built with SSL support**. Official builds are; some forks/distro builds may differ. Sync should probe (`SELECT SHA2('a', 256) IS NOT NULL`) and fail loudly.
- `MD5` returns `NULL` under FIPS mode; irrelevant if only `SHA2` is used. FIPS interaction with `SHA2` is **Unverified**.
- The 8.0/8.4/9.x function tables list no HMAC function. 9.x was checked against the 9.5 manual only, not every 9.x release.
- Not covered: MariaDB, Aurora, other forks.

## Secret visibility

Documented:

- `SHOW CREATE VIEW` needs `SHOW VIEW` plus `SELECT` on the view.
- `INFORMATION_SCHEMA.VIEWS` (`VIEW_DEFINITION`) needs `SHOW VIEW`. The manual does not say what a user without it sees (empty vs absent rows): **Unverified**.
- `EXPLAIN` on a view needs `SHOW VIEW` on that view, and `SELECT` on underlying tables. `EXPLAIN` + `SHOW WARNINGS` prints the optimizer-rewritten query, which for a merged view would include the expression text and so the secret. The privilege requirement is the documented guard. Old bugs ([#47419](https://bugs.mysql.com/bug.php?id=47419), [#7014](https://bugs.mysql.com/bug.php?id=7014)) show this check has been inconsistent historically, so **test on each supported version** that an Agent User with only `SELECT` on the views gets an error from `EXPLAIN`, and that no error message or `SHOW WARNINGS` output echoes view text.
- Stored `DEFINER` views run with the definer's privileges (default `SQL SECURITY DEFINER`), so the Agent User needs no privilege on the base tables or secret table.
- View `SELECT` may not reference system or user variables, so the secret cannot be passed as a session variable; it must be a literal or come from a table/function.

Admin-side exposure of a literal secret (inference from how MySQL logs DDL, **Unverified** per source): `CREATE VIEW` text in the binary log, general query log, audit logs, Performance Schema statement history, and `mysqldump` output. Anyone with these already has Admin Credentials or backups, but backups travelling elsewhere carry the secret.

Alternative: **secret in a private table** (e.g. a one-row table in a schema the Agent User cannot read), referenced as a scalar subquery in the view.

- Pros: secret not in view text, dumps or `SHOW CREATE VIEW`; rotation is an `UPDATE`, not a view rebuild.
- Cons: extra object to grant to the definer; the manual notes `const`-table expressions are evaluated early, so a folded literal could still appear in `EXPLAIN` output (again guarded by `SHOW VIEW`); per-query cost **Unverified**; the secret and data share one backup unless the schema is excluded.
- A stored-function-held secret is a third option but conflicts with the spirit of ADR 0001 (definer functions as an attack surface), and the function body is also visible to `SHOW CREATE FUNCTION` holders. Not recommended.

## NULLs and types

- NULLs: `SHA2(NULL, n)` returns `NULL`; `CONCAT` with any `NULL` argument returns `NULL` (standard MySQL behaviour; the HMAC expression above therefore yields `NULL` for `NULL` columns). The empty string is not `NULL` and hashes to a real value, so `''` and `NULL` stay distinguishable.
- `SHA2` hashes bytes. Nonbinary string input is in the connection charset when implicitly converted, so the same text in `latin1` vs `utf8mb4` columns can hash differently. Fix the representation with `CAST(col AS BINARY)` (bytes in the column's own charset) or an explicit `CONVERT(col USING utf8mb4)` first. Which is preferable depends on whether cross-table matching between differently encoded columns matters (open question).
- Byte hashing is exact, so `'a'` and `'a '` differ even where a `PAD SPACE` collation says they are equal in `=`. Hash equality is stricter than SQL equality; collation-insensitive matching is not possible unless the view normalises (e.g. `LOWER`) before hashing. A design choice to record.
- Numbers and temporals are implicitly converted to strings. The manual confirms conversion happens but not the exact formats for `DECIMAL` scale or `DATETIME` fractional seconds: **Unverified**. Floats use the `dtoa` shortest round-trip form, documented as consistent across platforms. Prefer explicit casts per column type (`CAST(x AS CHAR)`, `DATE_FORMAT`, fixed-scale `DECIMAL`) so the canonical form is pinned by the generated view, not by server defaults. `JSON` columns: cast to `CHAR` (normalised form), details **Unverified**.
- Raw `BINARY`/`BLOB` columns hash directly.
- View-output type: `SHA2` returns a string in the connection charset; the view column will be a string type. Collation derivation for view columns is not covered in the CREATE VIEW page: **Unverified**, but only matters for comparisons across the hash column.

## Suggested verification (Testcontainers, before building)

- Compare the SQL expression with `node:crypto` HMAC-SHA256 for strings, empty string, multibyte text, binary, and keys of 32 bytes.
- Run on MySQL 8.0, 8.4 and the current 9.x innovation release.
- As the Agent User: `SHOW CREATE VIEW`, `SELECT ... FROM information_schema.views`, `EXPLAIN` + `SHOW WARNINGS`, and a deliberately erroring query; assert no secret or pad bytes appear.
- Confirm NULL passthrough and the type canonicalisation cases above.

## Sources

- [MySQL 8.4: Encryption and Compression Functions](https://dev.mysql.com/doc/refman/8.4/en/encryption-functions.html) (also [8.0](https://dev.mysql.com/doc/refman/8.0/en/encryption-functions.html) and [9.5](https://dev.mysql.com/doc/refman/9.5/en/encryption-functions.html)): `SHA2` semantics, NULL behaviour, SSL requirement, no HMAC function.
- [MySQL 8.4: Bit Functions](https://dev.mysql.com/doc/refman/8.4/en/bit-functions.html): binary-string `^` and equal-length rule.
- [MySQL 8.4: CREATE VIEW](https://dev.mysql.com/doc/refman/8.4/en/create-view.html): `SQL SECURITY`, no variables in view SELECT.
- [MySQL 8.4: SHOW CREATE VIEW](https://dev.mysql.com/doc/refman/8.4/en/show-create-view.html), [INFORMATION_SCHEMA VIEWS](https://dev.mysql.com/doc/refman/8.4/en/information-schema-views-table.html), [View Restrictions](https://dev.mysql.com/doc/refman/8.4/en/view-restrictions.html): `SHOW VIEW` requirements.
- [MySQL 8.4: EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [EXPLAIN output / SHOW WARNINGS](https://dev.mysql.com/doc/refman/8.4/en/explain-extended.html), [Privileges Provided](https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html): `SHOW VIEW` needed for `EXPLAIN` on views; rewritten query output.
- [MySQL 8.4: Type Conversion](https://dev.mysql.com/doc/refman/8.4/en/type-conversion.html): implicit string conversion, `dtoa`.
- MySQL bugs [#47419](https://bugs.mysql.com/bug.php?id=47419) and [#7014](https://bugs.mysql.com/bug.php?id=7014): history of inconsistent `EXPLAIN` on views privilege checks (seen via search snippets, not read in full).
- [RFC 2104: HMAC](https://datatracker.ietf.org/doc/html/rfc2104): construction, ipad/opad, block size, key and truncation guidance. Does not discuss length extension itself.
- [Wikipedia: Length extension attack](https://en.wikipedia.org/wiki/Length_extension_attack): secret-prefix SHA-2 vulnerable, SHA-384 and SHA-512/256 not, secret-suffix collision caveat. Secondary source; a primary one was not consulted.
- Repo context: `docs/adr/0001-database-enforced-access-through-safe-schema.md`, `docs/adr/0003-keyed-hash-per-environment-for-obfuscated-columns.md`.
