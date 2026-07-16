# Preproduction

This directory preserves the planning history for SlackPad 360. Each cycle is
immutable after review so changes in scope, evidence, and technical decisions
remain visible in Git.

## Current status map (Sprint 02 S5)

Where each layer of documentation stands today — pointers only, nothing
historical was rewritten:

1. **Cycles 01–02** — immutable planning history.
2. **Cycle 03 + `final/`** — the architecture reference (module ownership,
   determinism, gates). Milestones M0–M10 were implemented from it.
3. **`reviews/03-feel-audit-and-redesign.md`** — the CURRENT design direction:
   why the M-era build felt wrong, the design law (fingers planted = direct
   authority; heading ≠ travel), and the staged feel plan. Where it conflicts
   with `final/` input/physics specs, reviews/03 wins.
4. **`final/SPRINT-RUNBOOK.md`** — the executable chain implementing that
   direction (Sprint 02 feel → Sprint 03 tricks/grinds → Checkpoint 01 →
   Sprint 04). Progress: `evidence/impl/SPRINT-LEDGER.md`; per-sprint evidence
   under `evidence/impl/sprint-NN/`.
5. **`HUMAN_TEST.md`** (repo root, written by Sprint 02 S6) — the current
   human loop: the scripted 10-minute session whose findings gate everything
   after Checkpoint 01.

## Cycles

1. `01-foundation`: establish the complete product, technology, asset, and
   verification foundation from research and primary sources.
2. `02-adversarial`: challenge cycle 1, resolve contradictions, compare viable
   alternatives, and revise the specifications.
3. `03-production`: consolidate the final build architecture, milestone plan,
   acceptance tests, and autonomous implementation goal.

**Authoritative navigation after cycle 3:** `preproduction/final/`

**Autonomous implementer prompt:** `preproduction/final/AUTONOMOUS_BUILD_GOAL.md`

**Cycle-3 validators:** `preproduction/probes/validate-cycle-03.mjs`, `validate-final.mjs`

Production code must not begin until all three cycles have been reviewed and
the remaining uncertainties are represented by explicit prototype gates
(see `preproduction/final/RISK_AND_GATES.md`). Cycles 1–2 remain immutable
history; do not rewrite them to clean up the final package.
