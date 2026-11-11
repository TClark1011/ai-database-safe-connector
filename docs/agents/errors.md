# Errors

Every failure a human or the agent sees is an `AppError` from `@ai-database-safety-experiment/core`, in the MCP, Sync and the setup CLI alike. It carries:

- `code`: a stable `ErrorCode` in `SCREAMING_SNAKE_CASE`. Never change what an existing code means or reuse one for a different cause; add a new code instead.
- `message`: the cause, in plain text.
- `nextStep`: what the human (or agent) does to fix it, naming the exact command or file where there is one.

`formatError` renders one as:

```
[CODE] cause
Next step: next step
```

Rules:

- Throw `AppError` wherever the cause is known. Wrap library errors at the boundary that knows what failed (Sync wraps them as `SYNC_FAILED`, query execution as `QUERY_FAILED`, or `QUERY_TIMED_OUT` when it ran past the time limit, the keychain as `KEYCHAIN_UNAVAILABLE`), keeping the original as `cause`. Use `errorMessage` for the wrapped error's text.
- Keep the Admin username out of messages the agent sees; Sync replaces it with `<redacted>`.
- Anything else renders as `[UNEXPECTED]`, which is a bug.
- In the MCP, a failure is a tool error (`isError: true`) whose first text block is `formatError`'s output, followed by a notes block when there are notes. It never includes CSV.
- Fail closed: when Sync can't finish, refuse the query instead of running it on the applied state.
- Tests assert on the code, never on the full message. Match part of the text only when that text is the behaviour under test, such as a required next step, a declined-widening note or a redaction.
