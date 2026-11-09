# Widening Changes diff effective exposure against the database

Sync finds Widening Changes per Environment by comparing what the agent would see with what it sees now, never by comparing config text. The desired side is the Project Config resolved against the real database's `information_schema.COLUMNS`: either unrestricted, or a set of `(table, column, full|obfuscated)` that actually exist. The applied side is read from the database (ADR 0002): the Agent User's grants give the mode, and the Safe Schema's view columns give the column set. Access is ranked hidden < obfuscated < full < unrestricted, and a desired column that is absent from the applied side, or ranked higher there, is widening.

So the approval covers real exposure on a real database. A `globalColumnAllowlist` edit shows up as the concrete table columns it reaches. A column that was allowlisted but missing from the database, and appears later, needs approval even though the config didn't change. A new Environment, or one pointed at a different server, has nothing applied, so all of its exposure is widening. An edit that changes nothing in the database needs no approval.

Whether an applied column is full or obfuscated exists only in the view's `VIEW_DEFINITION`, which MySQL stores rewritten. A column counts as full only if its definition is a bare column reference in exactly MySQL's rewritten form; anything else counts as obfuscated. More generally, any applied state Sync can't read, such as an invalid view, counts as the lowest rank. Misreading can then only cause an extra approval prompt, never a silent widening.

## Considered Options

- **Diff against the last approved config** (rejected): needs a stored copy the agent could tamper with (ADR 0002), and misses columns that appear in the database later.
- **A manifest view listing each column's mode** (rejected): a claim about the views rather than the views themselves; an interrupted Sync could leave it saying obfuscated where a column is full.
- **Diff only the column set and rebuild every view** (rejected): can't see obfuscated -> full.

## Consequences

- Narrowing rows apply first and at once; the widening rows get one yes/no per Environment, and a rejection leaves them at their applied level.
- Changes in MySQL's view rewriting across versions cause spurious prompts until Sync's parser is updated; Testcontainers tests per supported version catch them.
- A half-finished Sync re-prompts for columns that were already approved.
- Changing an Environment's `database` on the same server trips the ownership check (ADR 0010), because it looks the same as a second project.
- TLS and port settings aren't exposure, so changing them is never a Widening Change.
