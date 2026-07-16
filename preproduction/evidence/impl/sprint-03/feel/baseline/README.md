# Sprint 03 — trick/grind baseline (Sprint-02-final build)

Captured at Sprint 02 completion (post-`a01b612`) with the T0 instrument
extension only — no air/grind behavior changes yet:

```
npm run feel:report -- --gates steer,nav,pop --out preproduction/evidence/impl/sprint-03/feel/baseline
```

(exit 0 — every Sprint 02 gate still enforced and green under the extended
report.)

## Baseline readings (instrument truth, not feel verdicts)

| metric | baseline | T2/T3 gate |
| --- | --- | --- |
| trick.recogLagMs (worst, kick+shuv L1) | 33.3 | ≤ 50 (already green) |
| trick.torqueLagMs (worst) | 16.7 | ≤ 33.4 (already green) |
| trick.flipCompletion (median of 20) | 0.92 turns of 1.0 | tracked |
| trick.shuvCompletionDeg (median of 20) | 169.2° of 180° | tracked |
| trick.catchResidualP90Deg (+1 step) | 96.7° | ≤ 8 (RED — see note) |
| trick.catchResidual4P90Deg (+4 steps) | 78.7° | tracked |
| kickflip battery L1 (first 10) | 10/10 caught+landed | ≥ 9 (green) |
| bs-shuv battery L1 (first 10) | 10/10 | ≥ 8 (green) |
| grind envelope (7 angles × 5 speeds) | 35/35 latch, all fifty-fifty | map artifact |
| grind.centralLatchOf10 | 10/10 | ≥ 10 (green) |
| grind.holdSeconds | 1.35 (exit: speed-end) | ≥ 3 (RED) |
| grind.recoveryOk | slip UNREACHABLE (see finding) | == true (RED) |
| bail.histogram | { misaligned: 8 } — all from fs-shuv@L0 | tracked |

## Findings the gates exist to fix

1. **Catch residual:** the catch fires while the deck is still mid-rotation
   (~0.92 of a flip) — tilt one step after catch is ~50–97°, and still ~79°
   four steps later. The "board snaps under you" read does not exist yet;
   the level-off happens over the whole descent instead. T2's job.
2. **Grind balance is decorative:** with balanceInputGain 2.4 vs
   balanceSelfCenter 2.2 and balanceLimit 1.0, the steady-state balance from
   a maximal lateral finger bias is ≈0.15 — **balance-fail is unreachable
   from input**, so the slip/kick/cooldown anti-death-loop machinery never
   executes in play, and the balance meter cannot be failed or meaningfully
   fought. T3's fairness work must make balance a real, fair mechanic.
3. **Neutral hold ends at 1.35 s by speed-end** — grind friction eats a
   ~3.5 m/s entry in under a ledge-half. The ≥3 s gate implies retuning
   grind speed decay (in Sprint 03's scope, unlike Sprint 02's).
4. **fs-shuv at L0 lands 0/8** (all `misaligned` bails): without assists the
   fs rotation under the scripted competent input never aligns. L1/L2 land
   8/8. Fairness data for the assist-level design; not gated (T2 gates are
   L1).
5. Envelope latching is uniformly generous (35/35 including 30° at 5 m/s) —
   watch the map as T3 changes grind dynamics; it must not silently narrow.
