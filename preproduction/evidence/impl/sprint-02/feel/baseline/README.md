# Sprint 02 — feel baseline (untouched build)

Captured on the pre-sprint baseline (commit `3ace102` + S0 instrumentation only —
no behavior changes), 2026-07-16, via:

```
npm run feel:report -- --out preproduction/evidence/impl/sprint-02/feel/baseline
```

## What this shows (instrument readings, not feel verdicts)

The baseline quantifies every steering diagnosis in
`preproduction/reviews/03-feel-audit-and-redesign.md` §2:

| metric | baseline | gate (stage) | audit prediction it confirms |
| --- | --- | --- | --- |
| steer.lagMs | 233.3 | < 50 (S2) | heading servo trails fingers by ~a quarter second |
| steer.trackErrDeg | 36.6 | < 5 (S2) | 200°/s ask vs ~36°/s response (§2.1 item 2) |
| steer.pivotDeg | 0.24 of 200 asked | ≥ 80 (S2) | standstill dead zone — `rideMotionFullSpeed` gate (§2.1 item 3) |
| steer.ratchetAchievedDeg | 30.1 of 90 asked | — | absolute mapping cannot ratchet; board partially RETURNS on re-grip (§2.1 item 1) |
| pop.latencyMs (max of 20) | 66.7 | ≤ 80 (S4) | latency is NOT the pop problem |
| pop.silhouetteRmsDeg (max of 20) | 16.9 | < 4 (S4) | no authored silhouette — "weird hop" (§2.2) |
| land.cleanRate | 1.00 | tracked | assists work; reliability was never the failure |
| flick.recognizedKickflipRate | 1.00 | tracked | recognizer works; feel is the failure |

Determinism: the runner executes the full battery twice per invocation and
asserts byte-identical JSON/SVG/markdown; two separate invocations were also
diffed byte-identical before this capture was committed.

`nav.*` metrics are S1.5 placeholders (playability probes land next).

Plots (`plots/*.svg`) are the ten-second human review channel:
`steer-turn-plus.svg` shows the board reaching only ~30° of a 45° ask;
`steer-ratchet.svg` shows the re-grip staircase collapsing under absolute
mapping; `ollie-pitch.svg` shows measured pitch vs the reference silhouette
the S4 curve tracker must hit.
