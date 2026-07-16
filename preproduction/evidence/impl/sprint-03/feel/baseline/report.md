# SlackPad 360 — feel report

Deterministic headless run of the canonical feel scenarios (reviews/03 §Stage 0.2).
Metrics are instrument readings, not feel verdicts — feel is judged by a human.

## Gates

| gate | stage | value | target | pass |
| --- | --- | --- | --- | --- |
| steer.lagMs — finger→board yaw lag (45° @200°/s, worst dir) | S2 | 0 | < 50 | PASS |
| steer.trackErrDeg — max |commanded−actual| during turn (worst dir) | S2 | 1.523 | < 5 | PASS |
| steer.pivotDeg — yaw achieved by 1 s standstill rotation | S2 | 220.002 | >= 80 | PASS |
| pop.latencyMs — replant→first airborne step, worst of battery | S4 | 66.667 | <= 80 | PASS |
| pop.silhouetteRmsDeg — pitch vs authored curve RMS, worst of battery | S4 | 3.062 | < 4 | PASS |
| pop.bails — ollie battery bail count | S4 | 0 | == 0 | PASS |
| nav.slalom — 5-gate slalom, closed-loop wrist-range bot | S2 | 1 | == 1 | PASS |
| nav.pivot90 — standstill 90° in ≤1.5 s (two grips) | S2 | 1 | == 1 | PASS |
| trick.recogLagMs — gesture start → recognized, worst of kickflip+shuv batteries | T2 | 33.333 | <= 50 | PASS |
| trick.torqueLagMs — recognized → on-axis ω response, worst of batteries | T2 | 16.667 | <= 33.4 | PASS |
| trick.kickflipBattery — caught+landed of 10 kickflips at L1 (first 10 of battery) | T2 | 10 | >= 9 | PASS |
| trick.shuvBattery — caught+landed of 10 bs-shuvs at L1 (first 10 of battery) | T2 | 10 | >= 8 | PASS |
| trick.catchResidualP90Deg — p90 deck tilt one step after catch (L1 batteries) | T2 | 96.703 | <= 8 | fail |
| grind.centralLatch — central envelope cell latches, of 10 seeds at L1 | T3 | 10 | >= 10 | PASS |
| grind.holdSeconds — neutral-input balance hold on the straight ledge | T3 | 1.35 | >= 3 | fail |
| grind.recoveryOk — slip → cooldown respected → rideable recovery | T3 | 0 | == 1 | fail |

## Steering

| metric | value |
| --- | --- |
| steer.lagMs | 0 |
| steer.lagCorr | 0.991 |
| steer.trackErrDeg | 1.523 |
| steer.pivotDeg | 220.002 |
| steer.pivotCommandedDeg | 200 |
| steer.ratchetCommandedDeg | 99.00000000000001 |
| steer.ratchetAchievedDeg | 99.137 |
| steer.holdYawDriftDeg | 0.017 |
| steer.holdPosDriftM | 0.099 |
| steer.cruiseTurnLagMs | 0 |
| steer.cruiseTurnErrDeg | 1.376 |
| steer.turnSpeedMps | 3.113 |

## Pop / landing

| metric | value |
| --- | --- |
| pop.latencyMs | 66.67 |
| pop.latencyMedianMs | 50 |
| pop.liftoffFailures | 0 |
| pop.silhouettePreset | crisp |
| pop.silhouetteRmsDeg | 3.062 |
| pop.silhouetteRmsMedianDeg | 1.963 |
| pop.silhouetteRmsLandNormDeg | 3.643 |
| land.cleanRate | 0.65 |
| land.counts | {"clean":13,"dirty":7,"bail":0,"none":0} |
| nollie.latencyMs | 66.67 |
| nollie.counts | {"clean":13,"dirty":7,"bail":0,"none":0} |
| flick.recognizedKickflipRate | 1 |

## Playability probes (nav.*)

| probe | success | time (s) | detail |
| --- | --- | --- | --- |
| nav.rideStraight | PASS | 5.933 | {"travelledM":20.058,"maxLateralDevM":0.068} |
| nav.slalom | PASS | 12.317 | {"gatesPassed":5,"gatesCrossed":5,"gateErrorsM":[0.013,0.028,0.03,0.033,0.006]} |
| nav.pivot90 | PASS | 0.917 | {"achievedDeg":99.191,"commandedDeg":99} |
| nav.ollieBattery | PASS | — | {"landed":10,"total":10,"outcomes":["dirty","clean","dirty","dirty","dirty","dirty","clean","clean","clean","clean"]} |
| nav.popOverObstacle | PASS | — | {"popped":true,"crossedCurbWindow":true,"minLiftCrossingM":0.46,"curbHeightM":0.25,"outcome":"clean"} |

## Tricks (Sprint 03)

| metric | value |
| --- | --- |
| trick.recogLagMs | 33.33 |
| trick.recogLagMedianMs | 33.33 |
| trick.torqueLagMs | 16.67 |
| trick.flipCompletion | {"target":1,"min":0.872,"median":0.92,"max":0.937,"n":20} |
| trick.shuvCompletionDeg | {"target":180,"min":163.3,"median":169.2,"max":176.4,"n":20} |
| trick.catchResidualP90Deg | 96.7 |
| trick.catchResidualMedianDeg | 51.24 |
| trick.catchResidual4P90Deg | 78.74 |
| trick.catchResidual4MedianDeg | 41.12 |
| trick.batteryRate | {"kickflip@L0":1,"kickflip@L1":1,"kickflip@L2":1,"heelflip@L0":1,"heelflip@L1":1,"heelflip@L2":1,"bs-shuv@L0":1,"bs-shuv@L1":1,"bs-shuv@L2":1,"fs-shuv@L0":0,"fs-shuv@L1":1,"fs-shuv@L2":1} |

## Grind (Sprint 03)

| metric | value |
| --- | --- |
| grind.centralLatchOf10 | 10 |
| grind.holdSeconds | 1.35 (exit: speed-end) |
| grind.recovery | {"slipped":false,"cooldownRespected":true,"recovered":true,"exitReason":"speed-end"} |
| grind.envelope | see plots/grind-envelope.svg |
| bail.histogram | {"misaligned":8} |

## Config echo

| key | value |
| --- | --- |
| locomotion.steerDirectGain | 1.1 |
| locomotion.steerTrackGain | 24 |
| locomotion.steerServoGain | 180 |
| locomotion.steerMaxTorque | 900 |
| locomotion.gripRate | 8 |
| locomotion.gripSlipSpeed | 1.2 |
| physics.steerYawRateMax | 12 |
| physics.boardMass | 2.4 |
| physics.riderMass | 72 |
| pop.baseQuality | 0.6 |
| pop.jMin | 180 |
| pop.jMax | 300 |
| camera.chaseSide | -0.35 |
| camera.chaseDistance | 2.2 |

## Plots

- plots/steer-turn-plus.svg / steer-turn-minus.svg — fingers vs board during the 45° turn
- plots/steer-pivot.svg — standstill pivot
- plots/steer-ratchet.svg — 2×45° re-grip staircase
- plots/ollie-pitch.svg / nollie-pitch.svg — pitch vs reference silhouette
- plots/grind-envelope.svg — latch success over approach speed × angle
