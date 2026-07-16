/goal

# SlackPad 360 — Sprint 02: Feel, Instrumented (Autonomous)

You are an autonomous implementation agent executing from the repository root. This sprint does not
add scope. The vertical slice already exists and passes its tests while being unpleasant to play.
Your mission: **make the existing game feel like a tech deck, and prove every claim with
instruments you build first.** Work until the exit criteria are met or a stop rule fires, then hand
off to the human test script.

## Authoritative references (read in this order)

1. `preproduction/final/SPRINT-RUNBOOK.md` — the chain this sprint belongs to (ledger, protocol,
   what runs after this).
2. `preproduction/reviews/03-feel-audit-and-redesign.md` — the diagnosis and design law. This
   document is the WHY for everything below; read it fully before coding.
3. This file — the executable WHAT, in order, with gates.
4. `preproduction/final/ARCHITECTURE.md`, `final-technical-architecture.md` — module ownership
   rules (still binding: single input path, no pose writes outside sanctioned points, determinism).
5. `research/agent-observability.md` §6–7 — synthetic gesture generators + testing strategy.

**Supersession:** where this sprint or reviews/03 conflicts with `final-input-and-trick-spec.md`,
`final-physics-animation-camera-spec.md`, or `IMPLEMENTATION_PLAN.md` (M-ordering), **this sprint
wins**. Cycle 01/02 docs are historical; do not edit them (add pointers only, see S5).

## Non-goals (hard)

No grind tuning. No new tricks. No art, assets, audio mapping, or Blender. No host rewrite (one
small additive host change is allowed in S4, capped below). No new npm dependencies. No graphics
work. No RL/ML. Do not touch `assets/runtime/`. Do not "improve" unrelated code you pass by.

---

## 1. Claim discipline and stop rules (read twice)

This sprint exists because prior agent runs shipped green test suites around an unplayable game.
The failure mode was epistemic, not technical: claims outran verification.

1. **You may claim only what an instrument shows.** "Gates pass" is a claim you can make.
   "It feels good" is not — that claim is reserved for the human. Write "metrics pass; feel
   unverified" in every summary where that is the truth.
2. **Never weaken a gate, threshold, tolerance, or test to make it pass.** If a gate seems wrong,
   stop and write up why with evidence; do not adjust it.
3. **Three-strikes rule:** if a gate is still failing after three *architecturally distinct*
   attempts (not three tunings of one approach), stop that workstream, record findings in the final
   report, mark it `blocked`, and continue with independent workstreams.
4. **Determinism is a hard stop.** If the feel report produces different numbers on two consecutive
   runs of the same build, fix that before anything else; if you cannot, stop the sprint.
5. **Baseline before change.** Every behavior-changing workstream records its metrics on the
   untouched build first. Your proof of work is the baseline→after delta table, not prose.
6. **Tests that specify NEW behavior** land red→green inside the workstream that implements the
   behavior. **Tests that pin CURRENT correct behavior** (signs, polarities) land first in S1 and
   must pass against the untouched build — if one fails, you have found a live bug; fix it in the
   stage that owns that code path and say so.
7. **Never test gameplay through a browser, screenshots, or mouse emulation.** The testing surface
   is `AgentHarness` + `PadDriver` + the feel report, headless. (Browsers cannot receive raw
   multi-contact trackpad data at all; that is why the native host exists.)
8. Taste is config, not code: anywhere a value is aesthetic (curve shapes, camera offsets, gains
   within a working range), expose it as config with presets so the human can tune without you.

---

## 2. Workstreams, in order

Commit after each accepted workstream: `feat(sprint02-s<N>): <summary>`. Leave evidence under
`preproduction/evidence/impl/sprint-02/`.

### S0 — Feel report skeleton + baseline capture

Build `packages/game/scripts/feel-report.ts` (runner) + `packages/game/test/feel/` (scenario
scripts), executed headlessly via the existing harness. Add pnpm script `feel:report`.

- Scenario scripts drive `PadDriver` (see `test/helpers/maneuver.ts`) through canonical actions:
  dual plant/hold; ratchet turn 45° at ~200°/s (both directions); standstill finger rotation 1 s;
  cruise + turn; motionTap ollie ×20 (seeded spread); nollie ×20; flick-kickflip ×10.
- Metrics (exact definitions in reviews/03 §Stage 0.2): `steer.lagMs`, `steer.trackErrDeg`,
  `steer.pivotDeg`, `pop.latencyMs`, `pop.silhouetteRmsDeg`, `land.cleanRate`, plus `nav.*`
  placeholders (filled by S1.5 probes).
- Output: `report.json` (machine), `report.md` (table), and SVG plots (hand-rolled polyline SVG
  writer, no dependencies): finger-segment angle vs board yaw over time; ollie pitch vs time.
- `--no-gates` flag for baseline runs; gated mode exits nonzero on failure.
- **Gate S0:** report runs headlessly; two consecutive runs byte-identical JSON; baseline saved to
  `evidence/impl/sprint-02/feel/baseline/` and committed. Expect the baseline to be bad — that is
  the point.

### S1 — Perceptual contract suite

`packages/game/test/contracts/*.test.ts` — small PadDriver scripts + pose assertions pinning every
sign/direction (list in reviews/03 §Stage 0.1): finger rotation direction vs board yaw direction;
tail tap → tail dips/nose rises (nollie mirrored); flick direction → flip sign; sweep direction →
shuv sign; goofy mirrors all; camera azimuth within 15° of board heading while grounded (this one
lands red, fixed in S3). Use `ControlDiagnostics` where it already exposes the needed truth.

- **Gate S1:** every current-behavior contract passes on the untouched build (or the bug it caught
  is fixed and noted); new-behavior contracts are present and explicitly marked for their stage.

### S1.5 — Playability probes

Bot task scripts on PadDriver, reported in the feel report `nav.*` table: ride straight 20 m;
slalom through 5 virtual gates (±2 m offsets); standstill 90° pivot; 10/10 ollie battery; pop over
`test-obstacle`. Success/time per task. **Gate:** probes run and report; baseline recorded (slalom
and pivot are expected to fail on the untouched build — that failure is evidence, keep it).

### S2 — Steering feel floor (the core of the sprint)

Implement reviews/03 §Stage 1 exactly:

- `BoardController`: replace the absolute `-seg.angle` heading command with **relative** steering —
  accumulated wrapPi delta of segment angle since dual-plant, times `locomotion.steerDirectGain`
  (new key, default 1.1), emitted as a heading-delta/yaw-rate command. Remove the
  absolute-angle path. Ratcheting (lift, re-plant, continue turning) must work by construction.
- `SimWorld.applyGroundForces`: stiff yaw tracking of the commanded heading — direct clamped
  torque about deck-up (servo gain sized for ~30–50 ms time constant against the current inertia;
  raise `steerYawRateMax` to ~12 rad/s ceiling), **not** routed through truck steering geometry.
  Keep truck lean steering as flavor only. Remove the `rideMotionFullSpeed` gate on yaw authority.
  Prefer force-based first; if after three distinct servo formulations you cannot reach the lag/
  error gates, a bounded kinematic angular-velocity authority on ground is authorized — document
  the switch and keep all clamps.
- **Grip model** (heading ≠ travel): per grounded step, damp the lateral (board-right) component of
  horizontal velocity toward zero with `locomotion.gripRate` (new key, default 8/s hypothesis,
  force-based impulse, slip preserved above a `slipThreshold`). Longitudinal momentum untouched.
- Delete dead steering vocabulary only after proving it dead (grep + suite): `steerHeadingBiasGain`
  path, `steerYawGain`/`steerRateAtFull`/`steerInputFullScale`/`steerEngageFootSpeed` if unused
  after the rework. Update `config.ts` docs accordingly.
- **Gate S2 (feel report, gated mode):** `steer.lagMs < 50`; `steer.trackErrDeg < 5`;
  `steer.pivotDeg ≥ 80`; slalom and pivot probes pass; all S1 contracts still green; full suite
  green; replay/checkpoint determinism suite green.

### S3 — Camera

Reviews/03 Stage 1 camera items: behind-the-board defaults (`chaseSide` ≈ ±0.35, `chaseDistance`
≈ 2.0–2.4, ground `positionSmoothTime` ≈ 0.12), heading stays live at all speeds (rate-limit
replaces freeze; shrink the rest deadband to ~0.05 m). Expose as the existing config block; keep
`fingerboard` view working. **Gate:** camera-azimuth contract green; no other contract regressed.

### S4 — Ollie as a performance

Reviews/03 Stage 2, fixed-strength scope (intensity is OUT — see the gated-experiment note there):

- `pop.pitchCurve`: authored pitch silhouette as config control points `[tNorm, pitchDeg]`,
  presets `crisp` (default) / `floaty` / `aggressive`; generalize the existing `ollieLevel` PD into
  a curve tracker (`pitchCurve` command). Nollie mirrors. Scale by q (still constant for motionTap).
- Latency: replant→liftoff ≤ 80 ms measured end-to-end (`pop.latencyMs`); shorten the actuation
  envelope if needed — never below 2 substeps.
- Tail-strike accent: wire one existing vendored wood-hit SFX (already licensed, under
  `assets/source/vendor/`; runtime copy rules per assets/README) + a one-frame camera nudge. Label
  the SFX mapping non-final.
- Preset cycling hotkey (e.g. `P`) + current-preset readout on the DebugHud, so the human test can
  switch silhouettes live without code.
- **Gate S4:** `pop.latencyMs ≤ 80`; `pop.silhouetteRmsDeg < 4` against the active preset curve;
  ollie battery 10/10 clean-or-dirty (no bails) at default assist; contracts green.

### S5 — Trace corpus tooling + docs consolidation

- **Corpus:** record hotkey in the page (toggle session trace record; on stop, persist via the
  existing `exportControlTrace` host path). If the host lacks a file-write handler for it, add one
  — additive, ≤ ~50 lines of C#, files under `testdata/traces/`. Loader helper that replays a
  trace file through the harness in tests. `testdata/traces/README.md` with the labeling convention
  (`YYYYMMDD-<label>.trace.json`). Corpus ships empty; recording is a human action.
- **Docs:** update `preproduction/README.md` + `preproduction/final/README.md` with a short status
  map: cycles 01–02 historical → cycle 03 + `final/` architecture reference → `reviews/03` current
  design direction → this sprint executable → `HUMAN_TEST.md` current human loop. Pointers only;
  no rewrites of historical docs.
- **Gate S5:** a synthetic trace recorded via the hotkey path replays deterministically through the
  loader in a test.

### S6 — Final report + human handoff

- Re-run the full feel report; save to `evidence/impl/sprint-02/feel/after/`.
- `preproduction/evidence/impl/sprint-02/FINAL_REPORT.md`: status per workstream
  (`done|blocked|skipped` + why), the **baseline→after metric table**, unverified-claims list
  (anything only a human can judge), known gaps, how to resume.
- `HUMAN_TEST.md` at repo root: a 10-minute scripted session for the human — launch the native
  host; confirm TRACKPAD LIVE; ratchet a 90° turn both directions; standstill pivot; ride a lap;
  20 ollies + a few nollies; try soft vs hard taps (should feel identical — fixed strength);
  cycle pitch-curve presets with `P` and pick a favorite; record 3–5 labeled traces with the
  record hotkey (these seed the corpus); a table of "if X feels wrong → tune key Y / preset Z."

## Exit criteria (the sprint is done when)

All S0–S5 gates green (or explicitly `blocked` with three-strikes evidence), full suite green,
determinism green, FINAL_REPORT + HUMAN_TEST written, working tree committed. Done means the human
can sit down, run one script, and judge feel — not that feel is claimed solved.

Then update `preproduction/evidence/impl/SPRINT-LEDGER.md` and **continue immediately to Sprint 03
per `SPRINT-RUNBOOK.md` — do not pause here.** The human exercises `HUMAN_TEST.md` at Checkpoint
01, after Sprint 03.
