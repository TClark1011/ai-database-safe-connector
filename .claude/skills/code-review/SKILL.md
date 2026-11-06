---
name: code-review
description: 'Review the changes since a fixed point (commit, branch, tag, or merge-base) in parallel sub-agents along up to three axes: Standards (does the code follow this repo''s coding standards?), Security (does it introduce exploitable vulnerabilities?) and Spec (does it match the originating ticket or spec, when one exists?). Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".'
metadata:
  based-on-author: Matt Pocock, Sentry
  based-on-source: https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review, https://github.com/getsentry/skills/tree/main/skills/security-review
---

Review a diff, either between `HEAD` and a fixed point the user supplies or of the uncommitted changes, along up to three axes:

- **Standards**: does the code conform to this repo's coding standards?
- **Security**: does the code introduce exploitable vulnerabilities?
- **Spec**: does the code faithfully implement the originating ticket or spec? Runs only when a spec exists.

Each axis runs in its own **sub-agent** so the axes don't pollute each other's context. Each sub-agent reads its instructions from a file in this skill's directory:

| Axis      | Instructions file     |
| --------- | --------------------- |
| Standards | `standards-review.md` |
| Security  | `security-review.md`  |
| Spec      | `spec-review.md`      |

These files are for the sub-agents alone: pass each sub-agent the path to its file, and leave the contents to them so your context stays clear for aggregating.

## Process

### 1. Pin the diff

The user asks for one of two scopes. If they named neither, ask.

- **Since a fixed point**: whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). The diff command is `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`. Confirm the fixed point resolves (`git rev-parse <fixed-point>`).
- **Uncommitted changes**: the diff command is `git diff HEAD`, covering staged and unstaged changes against the last commit. Untracked files never appear in it: list them with `git ls-files --others --exclude-standard`, and show each as a diff with `git diff --no-index /dev/null <file>` (it exits 1 when the file is non-empty; that is not an error). This scope reads the working tree as it is and leaves the index untouched. There is no commit list.

Capture the diff commands once. Before going further, confirm the diff is non-empty, counting untracked files. A bad ref or empty diff should fail here, not inside parallel sub-agents.

### 2. Look for a spec

Many changes have no ticket or spec, and that is fine: a quick search that finds nothing is an expected outcome. Look for clues, roughly in this order:

1. Anything the user supplied: a path, URL, or ticket ID.
2. Ticket references in the branch name and commit messages (`#123`, `ABC-123`, tracker URLs).
3. The pull/merge request description, when the hosting platform's CLI is available (e.g. `gh pr view`).
4. Where this repo keeps specs: mentions of a tracker or spec location in `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` or `README.md`, and spec-like directories (`docs/`, `specs/`, `rfcs/`, `plans/`, etc.) holding a file that matches the branch name or feature.

A ticket reference counts only when one of your tools can reach its tracker (a CLI or MCP server, for example). Record the spec's **location**: a path, URL, or ticket ID plus the tool that fetches it. The Spec sub-agent reads the content itself.

If nothing usable turns up, skip the Spec axis without asking the user.

### 3. Dispatch the sub-agents in parallel

Issue all sub-agent calls together, in the foreground: Standards, Security, and Spec when step 2 found one. Each prompt contains:

- `Read <skill-dir>/<instructions file> and follow it.`, where `<skill-dir>` is the absolute path of this skill's directory.
- The diff commands from step 1, plus the commit list when there is one.
- Spec only: the spec location from step 2.

### 4. Summarise

Wait for every sub-agent to report, then summarise their findings for the user under `## Standards`, `## Security` and `## Spec` headings. Keep each finding's location and its label (hard violation or judgement call, severity, confidence). When the Spec axis was skipped, say so in one line under its heading.

Keep the axes separate: summarise each axis on its own terms, never merging or reranking findings across them. A change can pass one axis and fail another, and reporting them separately stops one from masking the other.

Then hunt for **conflicts**, within an axis or across axes: findings, rules or standards where satisfying one breaks another, including a finding whose fix would trip a lint rule. List each under a `## Conflicts` heading, naming the findings involved by axis, with a suggested way out:

- **Exception**: the violation is minor and the situation gives a legitimate reason for it. Make a scoped exception at the site: a lint disable comment, or a comment explaining the intentional departure from the standard.
- **Refactor**: the violation is major, or the case for an exception is weak. Restructure the implementation so nothing is violated, while keeping the quality of the code and of the solution intact. A refactor that significantly degrades either is not a way out; fall back to an exception and say why.

End with a one-line tally: findings per axis, the worst issue _within each axis_ (if any), and the number of conflicts.
