/goal

# SlackPad 360 — Sprint 03: Tricks on Instruments (Autonomous)

Prerequisite: Sprint 02 complete per `SPRINT-RUNBOOK.md` (ledger shows `sprint-02: done`). You are
an autonomous implementation agent executing from the repository root. Mission: bring the air/trick
and grind layers up to the same instrumented standard Sprint 02 gave ground feel — measured, contract-
pinned, and tunable by config — **without retuning anything Sprint 02 shipped.**

## Authoritative references

1. `preproduction/reviews/03-feel-audit-and-redesign.md` — design law (§3) and guardrails (§5).
2. `preproduction/final/SPRINT-02-FEEL-GOAL.md` **§1 (Claim discipline and stop rules) applies to
   this sprint verbatim.** Re-read it now.
3. `preproduction/evidence/impl/sprint-02/FINAL_REPORT.md` — inherit its blocked items and gaps.
4. `final-input-and-trick-spec.md` §3/§5 (recognition grammar), `final-physics-animation-camera-spec.md`
   §3–4 (envelopes, grind) — still normative where reviews/03 doesn't supersede.

## Non-goals (hard)

No changes to ground steering, grip model, camera, or ollie silhouette beyond bugfixes with contract
coverage (those await the human verdict). No new tricks beyond the shipped vocabulary (flip, heel,
fs/bs shuv, 50-50, boardslide). No art/audio beyond wiring existing vendored SFX as labeled proxies.
No new dependencies. No host changes. No tap-intensity work.

## Workstreams, in order

Commit per workstream: `feat(sprint03-t<N>): <summary>`. Evidence under
`preproduction/evidence/impl/sprint-03/`.

### T0 — Extend the feel report to tricks and grind (baseline first)

New metrics, same runner, same determinism gate (two runs byte-identical), baseline committed
before any behavior change:

| Metric | Definition |
| --- | --- |
| `trick.recogLagMs` | first flick/sweep sample above threshold → intent recognized |
| `trick.torqueLagMs` | recognition → first step with on-axis angular acceleration |
| `trick.flipCompletion` | signed turns at catch/land vs target, distribution over ×20 seeded kickflips |
| `trick.shuvCompletionDeg` | same for shuvs vs `shuvTargetDeg` |
| `trick.catchResidualDeg` | off-level residual immediately after catch damping, distribution |
| `trick.batteryRate.<label>` | landed (clean+dirty) rate per trick battery at each assist level |
| `grind.envelopeMap` | latch success over approach speed × angle grid (SVG heatmap artifact) |
| `grind.holdSeconds` | balance hold under neutral input on the straight rail |
| `grind.recoveryOk` | slip → no re-latch within cooldown → recoverable landing (boolean probe) |
| `bail.histogram` | bail reasons across all batteries |

### T1 — Trick & grind contract suite

Audit existing tests first (`flip-direction`, `shuv-180`, `gt-*`, `grind-*` and friends) — extend,
do not duplicate. Pin as contracts: flick direction → flip sign; sweep direction → shuv sign; goofy
mirrors both; catch never opens before apex when `apexOnly`; quantize at L0 never fires; grind latch
only from air/recent-pop; hop-out reuses the pop path; slip exits respect `relatchCooldownSteps`.
Current-behavior contracts must pass on the untouched build (a failure = live bug; fix + note).

### T2 — Air response feel floor

Judged by T0 metrics; taste values as config presets:

- `trick.recogLagMs ≤ 50` and `trick.torqueLagMs ≤ 33` (2 steps) at default sensitivity. If the
  recognizer needs more evidence frames than that, the gate wins — restructure evidence collection
  (e.g. provisional open + revise), never silently relax the gate.
- Rotation envelopes reach targets within representative airtime at each assist level:
  kickflip battery ≥ 9/10 caught+landed at L1 with scripted competent input; shuv battery ≥ 8/10.
  Publish the per-level completion tables in the report.
- Catch readability: `trick.catchResidualDeg` p90 ≤ 8° at L1 (the "board snaps under you" read),
  with L0 untouched (no snap by construction — contract-pinned).

### T3 — Grind fairness floor

- Envelope map artifact generated; central cells (valid speed, near-envelope angles) latch 10/10 at
  L1; L0 stays pure-physics (contract).
- `grind.holdSeconds ≥ 3` under neutral input; `grind.recoveryOk` true (anti-death-loop, probe).
- Wire one vendored metal/rail SFX as a labeled proxy for latch/grind loop if trivially attachable
  to existing telemetry events; otherwise skip (non-goal pressure beats nice-to-have).

### T4 — Live tuning HUD (for the human checkpoint)

Dev-only panel (extend DebugHud; no new deps): live edit of a whitelisted config subset —
`steerDirectGain`, `gripRate`, pop curve preset, flip/shuv `tauMax`/`omega` scalars, catch
`assistScale`, camera offsets — with current values displayed, reset-to-default, and a "copy as
JSON" dump. Mutations apply on harness reset, never mid-determinism-sensitive runs; panel state is
excluded from replay hashes (assert this in a test). One test proves a HUD-mutated config
round-trips into a fresh harness run.

### T5 — Report + handoff

- Re-run full feel report → `evidence/impl/sprint-03/feel/after/`; baseline→after tables.
- `evidence/impl/sprint-03/FINAL_REPORT.md` (same format as Sprint 02).
- Extend `HUMAN_TEST.md` with a trick section: flicks both directions, shuvs both directions, a few
  grinds, catch feel at L0 vs L1 vs L2, HUD tuning instructions, and 5 more labeled trace prompts
  (`kickflip-attempt`, `grind-5050`, …).

## Exit criteria

All gates green or blocked-with-evidence; suite + determinism green; reports written; Sprint 02
contracts and metrics unregressed (re-run them — regression = stop and fix before exit). Then
consult `SPRINT-RUNBOOK.md`: the next boundary is the **human checkpoint** — write the pause
packet; do not begin Sprint 04.
