---
name: coding-workflow
description: Take a code change from plan to pull request - grill, test-driven development, verify, review, commit, push and PR.
disable-model-invocation: true
---

# Coding workflow

Carry one requested change from plan to a pull request. Each step ends on its **Done when**; reach it before moving on.

A **loop-back** sends feedback to the TDD step (4.1) and resumes the workflow from there. Carry the feedback that triggered it into TDD as the work to address.

## 0. Preflight

- If the project has no `verify-code` skill, stop. Tell the user to run the `setup-code-quality-assurance` Playbook from the `TClark1011/personal-ai-setup` repository first, or to continue without the verify step (4.2), and wait for their choice.
- If the working tree has uncommitted changes, ask the user to commit or stash them first, or to continue anyway.

**Done when** the user has answered every question this step raised.

## 1. Grill

Invoke the `grilling` and `domain-modeling` skills and follow both together.

As the design settles, judge whether the work splits into **phases**: parts so distinct and separate that each deserves its own commit. Offer multiple phases only with considerable justification; the default is one phase and one commit.

**Done when** the grilling is complete and the user has confirmed the shared understanding, including the phases if you offered them.

## 2. Branch

Find the project's **Dev Branch**: the branch all new changes are merged into first. It is often the default branch, but some projects keep production on the default branch and merge new work into a separate branch first. Infer it from branch names and recent commit history (which branch feature branches merge into). If the evidence is ambiguous, ask the user.

Create a new branch off the Dev Branch, named from what the grilling settled. Follow the project's branch naming convention (from `AGENTS.md`, contributing docs or recent branch names), or `<conventional-commit-type>/<short-slug>` when there is none.

**Done when** the new branch is checked out.

## 3. Spec

Post the **spec** as a single chat message: the requirements the grilling settled, and the phases if there are several. If the work came from a ticket one of your tools can reach, the ticket is the primary spec and the message adds what the grilling settled on top of it. The spec lives only in the conversation.

**Done when** the spec message is posted.

## 4. Per phase

Run 4.1 to 4.4 once per phase, in order.

### 4.1 TDD

Invoke the `test-driven-development` skill and implement the phase. On a loop-back, address exactly the feedback carried in.

**Done when** the `test-driven-development` skill's **Done when** holds.

### 4.2 Verify

Dispatch a sub-agent on the fastest model your harness offers (in Claude Code: `haiku`). Its brief:

- Run the `verify-code` skill, skipping the test command, with these overrides:
  - Run the Tidy fix command, and keep its fixes.
  - If the Tidy fix command changed any files, run the full test suite as well.
  - Report every other failure instead of fixing it. Edit no files.
  - For each conflict (where fixing one failure would cause another), name it and suggest the way out the `verify-code` skill gives.
- Report pass or fail, with each failure's command, location and output excerpt.

On any failure, loop back with the report.

**Done when** the sub-agent reports a pass.

### 4.3 Review

Invoke the `code-review` skill on the uncommitted changes, passing the spec from step 3. Handle its findings by **class**:

| Axis      | Hard violation                                  | Judgement call              |
| --------- | ----------------------------------------------- | --------------------------- |
| Standards | hard violations                                 | judgement calls             |
| Security  | HIGH confidence findings                        | MEDIUM "needs verification" |
| Spec      | (a) missing or partial, (c) implemented wrongly | (b) scope creep             |

- **Any hard violation**: loop back automatically with the hard violations alone, plus any conflicts that involve them. Leave the judgement calls; the next review raises them again.
- **Judgement calls only**: show them to the user and ask which to address. Loop back with the user's picks; the rest are let go.

**Done when** a review has no hard violations, and the user has either picked no judgement calls or there were none.

### 4.4 Commit

Commit the phase's changes with a message in the project's commit convention (Conventional Commits where a `commit-msg` hook enforces it).

**Done when** the commit exists.

## 5. Final review

Only when there were several phases. Invoke the `code-review` skill on the changes since the Dev Branch as its fixed point, passing the spec. Handle findings as in 4.3, except a loop-back here runs 4.1, 4.2 and 4.4, then returns to this step.

**Done when** the same bar as 4.3 is met across all the changes.

## 6. Push and PR

Push the branch and open a pull request against the Dev Branch, ready for review. Its description holds the spec.

**Done when** the pull request is open.

## Loop-back cap

After 3 automatic loop-backs in a row from the same step, stop. Show the user the remaining issues and ask whether to continue, change the plan, or accept them. The count resets when the user decides.
