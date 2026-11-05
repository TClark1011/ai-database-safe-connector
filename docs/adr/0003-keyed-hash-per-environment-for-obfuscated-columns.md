# Keyed hash per Environment for Obfuscated Columns

Obfuscated Columns are shown to the agent as a keyed hash of each value, with NULLs left visible, using a secret stored per Environment. The secret stops the agent confirming guesses by hashing candidate values itself, and making it per Environment stops it linking records between Environments. There is no reversible encryption and no lookup tool: humans who need the real value query it by ID with their own access.

## Considered Options

- **Unkeyed hash** (rejected): the agent can hash guesses, such as common emails, and compare.
- **Deterministic encryption with a decryption key** (rejected): a leaked key exposes every value the agent has seen, and MySQL's default `AES_ENCRYPT` mode (ECB) leaks patterns.
- **One secret per project** (rejected): lets the agent link records across Environments.
