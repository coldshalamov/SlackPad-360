# SlackPad 360 — Sprint Runbook (chain controller)

This file is the single entry point for autonomous sprint execution. It defines the sprint chain,
the ledger that makes runs resumable, and the one human checkpoint. An agent pointed at this file
can determine where the chain stands and continue it without conversation history.

## The chain

| # | Goal document | Human required? |
| --- | --- | --- |
| Sprint 02 | `SPRINT-02-FEEL-GOAL.md` — feel instruments + steering/camera/ollie | No |
| Sprint 03 | `SPRINT-03-TRICKS-GOAL.md` — trick/grind instruments + air feel + tuning HUD | No |
| **Checkpoint 01** | `HUMAN_TEST.md` (repo root, produced by 02+03) | **Yes — hard stop** |
| Sprint 04 | `SPRINT-04-TEMPLATE.md` → agent fills → `SPRINT-04-TUNING-GOAL.md` | No (one veto pause if it wants new scope) |

Design intent: 02 and 03 run back-to-back with zero human involvement. The chain **must** stop at
Checkpoint 01 — everything after it is shaped by real-hands evidence, and proceeding without that
evidence recreates the exact failure this plan exists to prevent.

## Execution protocol

1. **Orient.** Read this file, then `preproduction/evidence/impl/SPRINT-LEDGER.md`. If the ledger
   is missing, create it with the header below and status `sprint-02: not-started`.
2. **Bootstrap.** `git status` / `git rev-parse HEAD`; preserve unrelated work; run the existing
   test suite once to confirm a green starting point (a red start = fix or stop, never build on
   red). Node engines and pinned deps per `AUTONOMOUS_BUILD_GOAL.md` §0 — no new dependencies.
3. **Execute the next incomplete sprint** per its goal document. `SPRINT-02-FEEL-GOAL.md` §1
   (claim discipline and stop rules) governs every sprint in the chain.
4. **Close the sprint.** Exit criteria met (or workstreams individually `blocked` with
   three-strikes evidence) → update the ledger → commit → **continue immediately to the next row**
   unless the next row is a checkpoint.
5. **At Checkpoint 01:** write `preproduction/evidence/checkpoint-01/pause-packet.json`
   (`{gate, why, user_actions, artifacts_needed, resume_commit, next_sprint}`), where
   `user_actions` = run `HUMAN_TEST.md`, save findings to
   `preproduction/evidence/checkpoint-01/HUMAN_FINDINGS.md`, record labeled traces into
   `testdata/traces/`. Then stop cleanly.
6. **Resuming after the checkpoint:** the same goal prompt re-orients from the ledger; Sprint 04
   begins by verifying the checkpoint artifacts exist (template §1) and filling itself.

## Ledger format (`preproduction/evidence/impl/SPRINT-LEDGER.md`)

Append-only. One line per state change:

```
sprint-02 | done|blocked|in-progress | <git sha> | <UTC date> | <one-line note>
```

A sprint counts as `done` for chaining purposes when its exit criteria section says so — including
the "blocked items allowed if independent" clause. A `blocked` SPRINT (not workstream) halts the
chain; write a pause packet explaining what a human must decide.

## Hard rules for the whole chain

- Stop rules and claim discipline: `SPRINT-02-FEEL-GOAL.md` §1, verbatim, always.
- Never proceed past Checkpoint 01 autonomously. Never begin Sprint 04 from the unfilled template.
- Sprint N must not retune Sprint N−1's shipped feel values except through a bugfix with contract
  coverage; verdict-driven retuning belongs to Sprint 04.
- Every sprint re-runs the previous sprints' contract suites and feel gates before claiming exit;
  a regression is a stop-and-fix, not a note.
- If context is lost or a session restarts mid-sprint: re-read this file, the ledger, the active
  sprint doc, and `reviews/03`; reconstruct position from git log + evidence dirs; do not restart
  completed workstreams (commits are the workstream boundaries).

## Canonical goal prompt (paste to a fresh agent to start or resume the chain)

```
/goal
Repo: SlackPad 360. Read preproduction/final/SPRINT-RUNBOOK.md and follow its execution protocol
exactly. Orient from preproduction/evidence/impl/SPRINT-LEDGER.md (create it if missing), execute
the next incomplete sprint from its goal document, and continue sprint-to-sprint without pausing.
Stop only at the runbook's human checkpoint, at a sprint-level block, or when a stop rule fires.
Claim discipline: SPRINT-02-FEEL-GOAL.md §1 — claim only what instruments show; "feels good" is
the human's sentence, not yours.
```
