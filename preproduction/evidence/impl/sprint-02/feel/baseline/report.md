# SlackPad 360 — feel report

Deterministic headless run of the canonical feel scenarios (reviews/03 §Stage 0.2).
Metrics are instrument readings, not feel verdicts — feel is judged by a human.

## Gates

| gate | stage | value | target | pass |
| --- | --- | --- | --- | --- |
| steer.lagMs — finger→board yaw lag (45° @200°/s, worst dir) | S2 | 233.333 | < 50 | fail |
| steer.trackErrDeg — max |commanded−actual| during turn (worst dir) | S2 | 36.629 | < 5 | fail |
| steer.pivotDeg — yaw achieved by 1 s standstill rotation | S2 | 0.241 | >= 80 | fail |
| pop.latencyMs — replant→first airborne step, worst of battery | S4 | 66.667 | <= 80 | PASS |
| pop.silhouetteRmsDeg — pitch vs authored curve RMS, worst of battery | S4 | 16.867 | < 4 | fail |
| pop.bails — ollie battery bail count | S4 | 0 | == 0 | PASS |

## Steering

| metric | value |
| --- | --- |
| steer.lagMs | 233.33 |
| steer.lagCorr | 0.737 |
| steer.trackErrDeg | 36.629 |
| steer.pivotDeg | 0.241 |
| steer.pivotCommandedDeg | 200 |
| steer.ratchetCommandedDeg | 90 |
| steer.ratchetAchievedDeg | 30.137 |
| steer.holdYawDriftDeg | 0.046 |
| steer.holdPosDriftM | 0.034 |
| steer.cruiseTurnLagMs | 216.67 |
| steer.cruiseTurnErrDeg | 36.665 |
| steer.turnSpeedMps | 3.15 |

## Pop / landing

| metric | value |
| --- | --- |
| pop.latencyMs | 66.67 |
| pop.latencyMedianMs | 50 |
| pop.liftoffFailures | 0 |
| pop.silhouetteRmsDeg | 16.867 |
| pop.silhouetteRmsMedianDeg | 16.571 |
| land.cleanRate | 1 |
| land.counts | {"clean":20,"dirty":0,"bail":0,"none":0} |
| nollie.latencyMs | 66.67 |
| nollie.counts | {"clean":20,"dirty":0,"bail":0,"none":0} |
| flick.recognizedKickflipRate | 1 |

## Config echo

| key | value |
| --- | --- |
| locomotion.steerHeadingBiasGain | 1.2 |
| locomotion.steerYawGain | 1.2 |
| locomotion.rideMotionFullSpeed | 0.35 |
| physics.steerYawRateMax | 2.6 |
| physics.boardMass | 2.4 |
| physics.riderMass | 72 |
| pop.baseQuality | 0.6 |
| pop.jMin | 180 |
| pop.jMax | 300 |
| camera.chaseSide | -1.25 |
| camera.chaseDistance | 1.2 |

## Plots

- plots/steer-turn-plus.svg / steer-turn-minus.svg — fingers vs board during the 45° turn
- plots/steer-pivot.svg — standstill pivot
- plots/steer-ratchet.svg — 2×45° re-grip staircase
- plots/ollie-pitch.svg / nollie-pitch.svg — pitch vs reference silhouette
