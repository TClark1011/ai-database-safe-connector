# Claude Code MCP elicitation support

Research for issue #12 (child of map #4). Supports [ADR 0002](../adr/0002-automatic-sync-with-human-approval-for-widening-changes.md). Researched 2026-11-06.

## Answer

- Yes. Claude Code supports MCP elicitation in **form** and **URL** modes. First added in v2.1.76 (changelog: "MCP servers can now request structured input mid-task via an interactive dialog (form fields or browser URL)"). URL mode first appears for 2025-11-25 connections in v2.1.287.
- Form-mode capability: Claude Code declares `elicitation: {form: {}, url: {}}` for stdio/sse/http/ws servers from a user's MCP config (v2.1.287+ on pre-2026-07-28 revisions, always on 2026-07-28). Other connections (e.g. claude.ai connectors) declare bare `elicitation: {}`, which means form only. Our stdio MCP is the first kind. Form mode is all we need.
- The human sees a terminal dialog with the server-supplied fields; Accept submits, Decline sends `decline`, Esc sends `cancel`. No user configuration needed. The model has no tool or path to answer it; the dialog answer goes straight to the server.
- **Caveat for ADR 0002:** the model cannot answer, but a configured `Elicitation` hook can auto-answer (`accept` with content) with no dialog. Hooks live in Claude Code settings, so the "only the human can answer" guarantee holds only if the agent cannot edit hook configuration (relates to ADR 0006 and 0007). Needs a decision, see Risks.
- Server side (SDK v2): use `ctx.mcpReq.elicitInput(...)` on pre-2026-07-28 connections; on 2026-07-28 connections it **throws** and the handler must return `inputRequired(...)`. The SDK's legacy shim lets one `inputRequired` handler serve both. Claude Code defaults stdio servers to 2026-07-28 (v2 runtime), so write the handler with `inputRequired`.
- Message length/formatting: **no documented limit** found for form-mode `message`, and no documented formatting (markdown etc.) support. Form schemas must be flat primitives, so a diff goes in `message` as plain text. Unverified how Claude Code renders long or multi-line messages; needs a hands-on test.

## Details

### Modes and capability (Claude Code)

- Form: dialog with fields defined by the server. URL: asks to open a link in the browser (URL capped by command-line escaping, about 4,000 to 8,000 chars; over the cap the user can only decline).
- Form requires nothing from the user ("No configuration is required"). Cloud sessions render a card (form card added v2.1.316, link card v2.1.317); if no card shows, the user cannot answer there.
- Java MCP SDK <= 0.17.0 servers can reject the `form`+`url` declaration. Not relevant to a TypeScript server.
- v2.1.287 changelog: a server that stops connecting after URL prompts landed can set `"bareElicitationCapability": true` in its MCP config entry. Not relevant unless we hit it.

### Who can answer

- Only the human via the dialog, or an `Elicitation` hook. Hook output `{hookSpecificOutput: {hookEventName: "Elicitation", action: "accept", content: {...}}}` (exit 0) answers for the user and no dialog appears; `decline`/`cancel` also supported. Hook matcher is the MCP server name.
- Exit 2 or `decision: "block"` declines (the top-level `decision` was ignored from v2.1.105 until v2.1.284).
- `ElicitationResult` hooks run after the user responds and can override the response before it reaches the server (hooks reference: "After a user responds to an MCP elicitation, before the response is sent back to the server").
- Therefore the server should treat only `action === "accept"` plus validated `content` as approval, and the approval design should assume hooks are a trusted-human-owned configuration. Whether the agent can write hook config depends on ADR 0007's sandboxed-shell assumption plus Claude Code's own settings protections; not verified here.

### Non-interactive sessions

- In non-interactive (`claude -p`) sessions with MCP tasks, Claude Code asks the server to cancel a task that requests input, without running `Elicitation` hooks or the Agent SDK `onElicitation` callback (MCP docs). v2.1.310: a tool call that times out in a non-interactive session with an unanswered elicitation gets an error telling Claude no answer came.
- Behaviour of plain (non-task) elicitation in `-p` mode is not documented in the pages I read. v2.1.117 fixed `elicitation/create` auto-cancelling in print/SDK mode when the server connected mid-turn, implying `-p` can route it (the Agent SDK has an `onElicitation` callback). Treat headless as "not guaranteed to reach a human"; the ADR's terminal fallback covers this, and cancel/decline must mean "not approved".

### Server side with `@modelcontextprotocol/server` v2 (docs at tag v2.4.0)

Pre-2026-07-28 connections (push style):

```ts
const result = await ctx.mcpReq.elicitInput({
  mode: "form",
  message: "...",
  requestedSchema: {
    type: "object",
    properties: { confirm: { type: "boolean", title: "Approve" } },
    required: ["confirm"],
  },
});
// result.action: 'accept' | 'decline' | 'cancel'; result.content only on accept
```

- SDK validates accepted content against `requestedSchema` before resolving.
- If the client did not declare the capability, `elicitInput` throws before sending; as a tool result it surfaces as `isError: true` ("Client does not support form elicitation."). Use this to trigger the fallback approval command.
- Default request timeout is 60 s; raise it (the tool call's own timeout too) because a human may take longer than that to review a diff. Forward `ctx.mcpReq.signal` so cancelling the tool call cancels the elicitation.

2026-07-28 connections (Claude Code's default for stdio):

```ts
return inputRequired({
  inputRequests: {
    approve: inputRequired.elicit({ message, requestedSchema: schema }),
  },
});
// next entry: acceptedContent(ctx.mcpReq.inputResponses, 'approve', schema)
```

- `elicitInput` throws here. The handler re-runs with the answers attached, so it must be write-once/idempotent; carry state via `requestState` (protect with `createRequestStateCodec`, `ServerOptions.requestState.verify`).
- Missing client capability rejects the call with `-32021`.
- Schema must be a flat object of primitives; nested objects and `.regex()` patterns throw `TypeError`.
- Legacy shim is on by default: on older connections the same `inputRequired` return is fulfilled via real `elicitation/create`. One handler for both. Set `ServerOptions.inputRequired.legacyShim: false` to disable.
- Implication: because the handler may re-run, Sync must not apply a Widening Change until the validated accept arrives, and the re-entered request must be bound to the exact diff shown (e.g. include a hash of the diff in `requestState`), so a changed Project Config between rounds cannot be approved by a stale answer. This is my inference, not from docs.

### Showing a Widening Change diff

- MCP spec: `message` is "a human-readable message explaining why the interaction is needed"; no length or format limits defined. Spec says clients should make clear what information is requested and why, and must identify the requesting server.
- Spec says servers SHOULD NOT include clickable URLs in form requests; form mode must not request secrets (not an issue for approvals).
- Form schemas cannot show structured diffs; options are plain text in `message` (a list of added columns/environments), field `title`/`description` strings, and one boolean field (or a single-select enum) for approve. Fixed-length summary plus an approve checkbox is the safest shape.
- Fix history hints at tall forms: v2.1.239 fixed forms taller than the terminal being clipped (now scrollable with Accept/Decline always visible); v2.1.238 fixed dialogs showing nothing for URLs over 4,096 chars. Suggests long forms render but edge cases have existed.
- Unknown: max rendered `message` length, whether newlines and monospace are preserved, whether ANSI/markdown is stripped. Recommend a manual test with a large diff before committing to the format.

## Risks and unknowns

- Hook auto-answer path (above) vs the ADR's "only the human can answer" wording; decide whether to rely on settings protection or to add a challenge a hook cannot satisfy blindly (e.g. a one-time code the human types, shown only in the dialog message; a hook sees the message too, so this does not fully close it). Needs grilling.
- Claude Code version floor: v2.1.287+ for both modes to a stdio server on pre-2026-07-28 revisions. Form mode alone predates this (v2.1.76 era); I could not confirm the exact capability declared before v2.1.287 (the v2.1.287 note implies a bare `elicitation: {}`, which is form-only, so approvals should still work).
- v2.1.76 date and details come from the official CHANGELOG.md; the exact release date was not verified from an official page.
- Message rendering limits (above) unverified.
- No testing of a live Claude Code session was done (not permitted without user request).

## Sources

- Claude Code MCP docs, "Respond to MCP elicitation requests" and "Elicitation modes Claude Code declares": https://code.claude.com/docs/en/mcp#respond-to-mcp-elicitation-requests
- Claude Code hooks reference (Elicitation, ElicitationResult): https://code.claude.com/docs/en/hooks#elicitation
- Claude Code CHANGELOG (v2.1.76, 2.1.117, 2.1.238, 2.1.239, 2.1.284, 2.1.287, 2.1.310): https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- MCP spec 2025-11-25, Elicitation: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- MCP TypeScript SDK v2.4.0, server elicitation guide: https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/docs/servers/elicitation.md
- MCP TypeScript SDK v2.4.0, input required guide: https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/docs/servers/input-required.md
