# M2 adversarial review — closure

The orchestrator ran a 5-lens adversarial review workflow over the M2 sim
skeleton (determinism, agent-contract, spec-fidelity, test-quality,
loop-and-render), each finding independently verified. Two findings were
CONFIRMED major; both are now RESOLVED in committed code. Recorded here to
close the loop.

## Finding 1 — record/replay quantization asymmetry (determinism, G4)

**Claim:** frames were quantized only at `stopRecording()`, so the live run
consumed RAW frames while replay consumed QUANTIZED ones; sub-quantum tPerfMs
ties could even reorder between record and replay, diverging G4 checkpoints
once the recognizer drives physics (M4+).

**Resolution:** quantization moved to INTAKE. `InputHub.push()` now runs
`canonicalizeFrame()` (quantize to the replay grid + rebuild a clean object)
before queueing, so the sim consumes identical values live and on replay, and
callers cannot mutate a queued/recorded frame. Verified in
`packages/game/src/input/InputHub.ts:29-55,102`. Regression test added:
`replay-hash.golden.test.ts` "sub-quantum tPerfMs ties replay in identical
order (canonicalized at intake)". Landed with the M3 commit; still holding at
M4 (89/7 green).

## Finding 2 — GameLoop accumulator unbounded under sustained throttling

**Claim:** per-frame intake was clamped to `maxFrameMs` but the accumulator
itself was never clamped after hitting `maxStepsPerFrame`; sustained rAF
throttling (occluded window at 1–4 fps) grew unbounded sim debt → a multi-second
fast-forward on resume, and `alpha = accumulator/dt` could exceed the
documented [0,1) contract.

**Resolution:** `GameLoop.tick()` now discards whole-step backlog after the
step cap, keeping only `accumulator % dt` (strictly < dt, so alpha stays < 1),
and reports the dropped time via an optional `onSaturated(droppedMs)` hook.
`tick(nowMs)` was also extracted as a public, deterministically-testable entry
(the rAF callback delegates to it). Verified in
`packages/game/src/app/GameLoop.ts:74-99`. Landed with the M4 commit.

## Rejected / not-real findings

The remaining lens findings (agent-contract holes, spec deviations, additional
test gaps) were either verifier-rejected as not-real or were verification
artifacts; several verify agents were also cut off by a session usage limit
mid-run (recorded in the workflow journal). The two findings above are the ones
that survived independent verification, and both are fixed.
