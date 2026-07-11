# Preproduction

This directory preserves the planning history for SlackPad 360. Each cycle is
immutable after review so changes in scope, evidence, and technical decisions
remain visible in Git.

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
