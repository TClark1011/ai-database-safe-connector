---
name: verify-code
description: Verifies a code change with the project's fix, check, typecheck, build and test commands. Run it as the final step of any coding work; the work is incomplete until it passes.
---

# Verify code

Run these from the repository root, in order. Fix each failure before moving to the next command. Whenever you change code to fix a failure, start again from step 1.

1. `pnpm fix`: applies lint fixes and formatting.
2. `pnpm check`: reports the lint and format problems `fix` couldn't resolve.
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test`: every test, including those against a real MySQL in Docker. If Docker isn't running, ask the user to start it.

Verification passes when all five commands pass, in one uninterrupted run, on the final state of the change.

When `typescript/prefer-readonly-parameter-types` fires on a parameter typed with a library's type, add that type to the rule's `allow` list in `.oxlintrc.json` (`{ "from": "package", "package": "<package name, not import path>", "name": [...] }`). The rule stays strict for the project's own types.

## Conflicting fixes

When fixing one failure causes another (two lint rules that contradict each other, or a lint rule against a type error), take one of two ways out:

- **Scoped exception**: the violation is minor and the situation gives a legitimate reason for it. Add an exception at the site only, such as `// oxlint-disable-next-line <rule>` with a comment giving the reason, or a comment explaining the intentional departure from the standard.
- **Restructure**: the violation is major, or the case for an exception is weak. Change the implementation so nothing is violated, keeping the quality of the code and of the solution intact.
